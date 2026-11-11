export type SecurityReview = {
  title: string;
  plan?: string;
  amountNgn?: string;
  monthlyPriceNgn?: string;
  paymentTiming?: 'now' | 'renewal';
  accountEnding?: string;
};
export type SecurityChallenge = {
  code: 'STEP_UP_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED' | 'PARENT_SESSION_VERIFICATION_REQUIRED';
  sensitivity: 'SENSITIVE_READ' | 'CRITICAL_CHANGE';
  challengeId?: string;
  parentSessionId?: string;
  deadline: number;
  review: SecurityReview;
};
export type VerificationResult = { actionProof: string | null; enrolled?: boolean };
type Signal = { aborted: boolean; addEventListener?: (name: string, fn: () => void, options?: { once: boolean }) => void;
  removeEventListener?: (name: string, fn: () => void) => void };
export type SecurityPrompt = {
  challenge: SecurityChallenge;
  identity: string;
  isCurrent: () => boolean;
  complete: (result: VerificationResult) => void;
  cancel: () => void;
};
type Presenter = (prompt: SecurityPrompt) => void | (() => void);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validActionProof = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const [id, secret, extra] = value.split('.');
  return extra === undefined && uuid.test(id) && /^[A-Za-z0-9_-]{43}$/.test(secret ?? '');
};
const now = () => performance.now();

export class SecurityVerificationCancelled extends Error {
  readonly code = 'ERR_CANCELED';
  readonly __CANCEL__ = true;
  constructor(message = 'Verification cancelled.') { super(message); this.name = 'SecurityVerificationCancelled'; }
}
export class SecurityVerificationError extends Error {
  readonly code = 'MFA_VERIFICATION_UNAVAILABLE';
}

/** Local cancellation binding only. The server alone verifies JWTs and grants access. */
export function securityIdentityFromToken(token: string | null | undefined, decodeBase64: (value: string) => string): string | null {
  try {
    if (!token || token.length > 16384) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(decodeBase64(base64 + '='.repeat((4 - base64.length % 4) % 4)));
    if (!uuid.test(claims.sub) || !uuid.test(claims.sid) || !Number.isSafeInteger(claims.authVersion) || claims.authVersion < 0 ||
      typeof claims.role !== 'string' || !/^[A-Za-z]{1,32}$/.test(claims.role)) return null;
    return `${claims.sub}:${claims.sid}:${claims.authVersion}:${claims.role}`;
  } catch { return null; }
}

export function parseSecurityChallenge(payload: unknown, requestStarted: number, clock = now): SecurityChallenge | null {
  const outer = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const data = typeof outer.code === 'string' ? outer : (outer.data && typeof outer.data === 'object' ? outer.data as Record<string, unknown> : {});
  if (!['STEP_UP_REQUIRED','MFA_ENROLLMENT_REQUIRED','PARENT_SESSION_VERIFICATION_REQUIRED'].includes(String(data.code)) ||
    !['SENSITIVE_READ','CRITICAL_CHANGE'].includes(String(data.sensitivity))) return null;
  const enrolled = data.code === 'MFA_ENROLLMENT_REQUIRED';
  const parent = data.code === 'PARENT_SESSION_VERIFICATION_REQUIRED';
  const ttl = enrolled ? 600_000 : Date.parse(String(data.expiresAt)) - Date.parse(String(data.serverNow));
  const elapsed = clock() - requestStarted;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > (enrolled ? 600_000 : 300_000) ||
    !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= ttl ||
    (parent ? data.sensitivity !== 'SENSITIVE_READ' || !uuid.test(String(data.parentSessionId)) : !enrolled && !uuid.test(String(data.challengeId)))) return null;
  const raw = data.review && typeof data.review === 'object' ? data.review as Record<string, unknown> : {};
  const review: SecurityReview = { title: typeof raw.title === 'string' && raw.title.length <= 120 ? raw.title : 'Verify your access' };
  const money = (value: unknown) => typeof value === 'string' && /^\d{1,10}(?:\.\d{1,2})?$/.test(value) ? value : undefined;
  if (typeof raw.plan === 'string' && ['THREAD','ASO_OKE','ARU','IGWE'].includes(raw.plan)) review.plan = raw.plan;
  review.amountNgn = money(raw.amountNgn); review.monthlyPriceNgn = money(raw.monthlyPriceNgn);
  if (raw.paymentTiming === 'now' || raw.paymentTiming === 'renewal') review.paymentTiming = raw.paymentTiming;
  if (typeof raw.accountEnding === 'string' && /^\d{4}$/.test(raw.accountEnding)) review.accountEnding = raw.accountEnding;
  return { code: data.code as SecurityChallenge['code'], sensitivity: data.sensitivity as SecurityChallenge['sensitivity'],
    challengeId: enrolled || parent ? undefined : String(data.challengeId),
    ...(parent ? { parentSessionId: String(data.parentSessionId) } : {}), deadline: requestStarted + ttl, review };
}

export function createSecurityChallengeBroker(clock = now) {
  let presenter: { token: symbol; show: Presenter } | null = null;
  type Pending = { token: symbol; identity: string; challenge: SecurityChallenge; promise: Promise<VerificationResult>;
    readers: number; finish: (result?: VerificationResult, reason?: Error) => void };
  let active: Pending | null = null;
  const cancellationListeners = new Set<() => void>();
  const cancel = () => {
    active?.finish(undefined, new SecurityVerificationCancelled());
    for (const listener of cancellationListeners) listener();
  };
  return {
    onCancel(listener: () => void) {
      cancellationListeners.add(listener);
      return () => { cancellationListeners.delete(listener); };
    },
    register(show: Presenter) {
      cancel();
      const token = Symbol(); presenter = { token, show };
      return () => { if (presenter?.token === token) { cancel(); presenter = null; } };
    },
    cancel,
    async request(challenge: SecurityChallenge, identity: string, currentIdentity: () => string | null, signal?: Signal) {
      const current = () => currentIdentity() === identity && !signal?.aborted && clock() < challenge.deadline;
      if (!identity || !current()) throw new SecurityVerificationCancelled('The sign-in session changed. Start this action again.');
      if (active && active.identity !== identity) cancel();
      if (active) {
        const parentMismatch = (challenge.code === 'PARENT_SESSION_VERIFICATION_REQUIRED' || active.challenge.code === 'PARENT_SESSION_VERIFICATION_REQUIRED') &&
          (challenge.code !== active.challenge.code || challenge.parentSessionId !== active.challenge.parentSessionId);
        if (parentMismatch || challenge.sensitivity !== 'SENSITIVE_READ' || active.readers >= 16)
          throw new SecurityVerificationError('Finish the current verification, then retry this action.');
        const joined = active; joined.readers++;
        let abort: (() => void) | undefined;
        let joinedTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([joined.promise, new Promise<never>((_resolve, reject) => {
            abort = () => reject(new SecurityVerificationCancelled());
            signal?.addEventListener?.('abort', abort, { once: true });
            joinedTimer = setTimeout(abort, Math.max(0, challenge.deadline - clock()));
            if (signal?.aborted) abort();
          })]);
          if (!current()) throw new SecurityVerificationCancelled();
          return { actionProof: null, enrolled: result.enrolled };
        } finally {
          joined.readers--;
          if (joinedTimer) clearTimeout(joinedTimer);
          if (abort) signal?.removeEventListener?.('abort', abort);
        }
      }
      if (!presenter) throw new SecurityVerificationError('Open Password & security to set up verification, then retry this action.');
      let resolve!: (value: VerificationResult) => void, reject!: (error: Error) => void;
      const promise = new Promise<VerificationResult>((yes, no) => { resolve = yes; reject = no; });
      let dismiss: (() => void) | undefined;
      const abort = () => pending.finish(undefined, new SecurityVerificationCancelled());
      const pending: Pending = { token: Symbol(), identity, challenge, promise, readers: 0, finish(result, reason) {
        if (active !== pending) return;
        active = null; if (timer) clearTimeout(timer); signal?.removeEventListener?.('abort', abort); dismiss?.();
        if (reason || !current()) { reject(reason ?? new SecurityVerificationCancelled()); return; }
        if (!result || (challenge.code === 'MFA_ENROLLMENT_REQUIRED' && result.enrolled !== true) ||
          (challenge.code === 'STEP_UP_REQUIRED' && challenge.sensitivity === 'CRITICAL_CHANGE' &&
            !validActionProof(result.actionProof))) {
          reject(new SecurityVerificationError('Verification could not be confirmed. Start this action again.')); return;
        }
        resolve({ actionProof: challenge.code === 'STEP_UP_REQUIRED' && challenge.sensitivity === 'CRITICAL_CHANGE'
          ? result.actionProof : null, ...(result.enrolled === true ? { enrolled: true } : {}) });
      } };
      active = pending;
      const timer = setTimeout(() => pending.finish(undefined, new SecurityVerificationCancelled('Verification expired. Start this action again.')), challenge.deadline - clock());
      signal?.addEventListener?.('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return promise; }
      try {
        const close = presenter.show({ challenge, identity, isCurrent: () => active === pending && current(),
          complete: result => pending.finish(result), cancel: () => pending.finish(undefined, new SecurityVerificationCancelled()) });
        if (typeof close === 'function') { if (active === pending) dismiss = close; else close(); }
      } catch (error) { pending.finish(undefined, error instanceof Error ? error : new Error('Verification could not open.')); }
      return promise;
    },
  };
}

export const securityChallenges = createSecurityChallengeBroker();
