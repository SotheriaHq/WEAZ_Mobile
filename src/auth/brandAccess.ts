import type { AuthUser, BrandMemberRole } from '@/src/auth/AuthContext';

const ACTIVE_STATUS = 'ACTIVE';

const CATALOG_WRITE_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'CATALOG_MANAGER',
]);
const ORDERS_READ_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'ORDER_MANAGER',
  'SUPPORT_AGENT',
  'VIEWER',
]);
const ORDERS_UPDATE_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'ORDER_MANAGER',
]);
const MESSAGES_READ_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'SUPPORT_AGENT',
]);
const MESSAGES_REPLY_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'SUPPORT_AGENT',
]);
const PAYOUTS_READ_ROLES = new Set<BrandMemberRole>(['OWNER']);

const getActiveMemberships = (user?: Pick<AuthUser, 'brandMemberships'> | null) =>
  (Array.isArray(user?.brandMemberships) ? user.brandMemberships : []).filter(
    (membership) => membership.status === ACTIVE_STATUS,
  );

export function getActiveBrandMembership(user?: AuthUser | null) {
  const activeMemberships = getActiveMemberships(user);
  if (activeMemberships.length === 0) {
    if (user?.type === 'BRAND' && user.activeBrandId) {
      return {
        brandId: user.activeBrandId,
        brandName: user.brandFullName ?? '',
        role: 'OWNER' as const,
        status: 'ACTIVE' as const,
        isOwner: true,
      };
    }
    return null;
  }

  return (
    activeMemberships.find((membership) => membership.brandId === user?.activeBrandId) ??
    activeMemberships[0] ??
    null
  );
}

export function getActiveBrandId(user?: AuthUser | null): string | null {
  return getActiveBrandMembership(user)?.brandId ?? user?.activeBrandId ?? null;
}

/**
 * Every id that means "this is me".
 *
 * A brand is reachable under more than one id. `/brands/:id` resolves by OWNER
 * USER id (see the routing note in `src/utils/mobileRouting.ts`), feed and
 * search rows carry whichever of the two the backend row happened to hold, and
 * `getActiveBrandId` returns the BRAND id. So an owner-identity check written
 * as a single `routeBrandId === activeBrandId` is false half the time it should
 * be true — and the screen that asked silently renders the owner their own
 * catalogue in visitor mode, with none of their controls.
 *
 * That was reproducible from the Runway: tapping your own card pushes
 * `/catalog/[brandId]` with the id on the feed row, which need not be the brand
 * id the session holds. Comparing against the whole identity set removes the
 * guess. Membership brand ids are included so a staff member switching
 * workspaces is still recognised in the workspace they are actually in.
 *
 * This answers IDENTITY only — "whose surface is this". It is never a
 * permission: pair it with `canManageCatalog` for that, exactly as before.
 */
export function getSelfIdentityIds(user?: AuthUser | null): string[] {
  if (!user) return [];
  const ids = [
    user.id,
    user.activeBrandId,
    ...getActiveMemberships(user).map((membership) => membership.brandId),
  ];
  return Array.from(
    new Set(
      ids
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id): id is string => id.length > 0),
    ),
  );
}

/** Does `candidateId` identify the signed-in account (user id or brand id)? */
export function isSelfIdentity(user: AuthUser | null | undefined, candidateId?: string | null): boolean {
  const candidate = typeof candidateId === 'string' ? candidateId.trim() : '';
  if (!candidate) return false;
  return getSelfIdentityIds(user).includes(candidate);
}

/**
 * Is this catalogue target the signed-in account?
 *
 * Feed rows carry an id and, separately, a username. The id is whichever of
 * the account's ids the payload held; the username is the one the viewer
 * actually recognises as theirs. Either match is the same person. A miss on
 * both means somebody else.
 */
export function isOwnCatalogueTarget(
  user: AuthUser | null | undefined,
  candidateId?: string | null,
  username?: string | null,
): boolean {
  if (isSelfIdentity(user, candidateId)) return true;
  const theirs = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const mine = typeof user?.username === 'string' ? user.username.trim().toLowerCase() : '';
  return theirs.length > 0 && theirs === mine;
}

export function hasActiveBrandMembership(user?: AuthUser | null): boolean {
  return Boolean(getActiveBrandMembership(user));
}

/**
 * Is this account a BRAND — regardless of how far through setup it is?
 *
 * Two different questions were being answered by `hasActiveBrandMembership`,
 * and only one of them is about identity:
 *
 *   CAPABILITY — "can this account manage a store right now?" False for a brand
 *   that has not created one is correct, and the bagging guards rely on it.
 *
 *   IDENTITY — "whose UI is this?" A brand that signed up an hour ago is still
 *   a brand and must never be shown shopper UI.
 *
 * `getActiveBrandMembership` synthesizes a membership for a BRAND account only
 * when `activeBrandId` is set, so a freshly verified brand reads as a shopper.
 * The island's Profile chip picks its destination from this, which is how a
 * brand ended up on `/me` — the shopper screen — right after verifying its
 * email, where it then requested buyer-only endpoints and the API answered
 * `400 Endpoint requires user type REGULAR`.
 *
 * Use THIS for identity and `hasActiveBrandMembership` for capability. Never
 * substitute one for the other.
 *
 * Deliberate twin of `fthreadly/src/lib/brandAccess.ts` — separate repos, so
 * change both or web and native disagree about who a brand is.
 */
export function isBrandAccount(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.type === 'BRAND' || hasActiveBrandMembership(user);
}

/**
 * A BRAND account that has no membership rows to govern it yet.
 *
 * `getActiveBrandMembership` synthesizes an OWNER membership for a BRAND
 * account only once `activeBrandId` is set, so a freshly verified brand has no
 * membership at all and `canManageCatalog` is false — which rendered the owner
 * their own catalogue in visitor mode, with no way to set it up.
 *
 * This closes that gap without substituting identity for capability, which the
 * note on `isBrandAccount` forbids and for good reason: `isBrandAccount` is
 * true for ANY active membership regardless of role, so using it as the
 * permission would hand owner controls to a `VIEWER` or `SUPPORT_AGENT` staff
 * member on somebody else's brand. The condition here is deliberately narrow —
 * a BRAND principal with no memberships has no role to respect. The moment any
 * membership exists, `CATALOG_WRITE_ROLES` governs again.
 *
 * Still a capability, so it is still paired with an identity check at the call
 * site. It never says WHOSE catalogue is on screen.
 */
export function isUnprovisionedBrandPrincipal(user?: AuthUser | null): boolean {
  if (user?.type !== 'BRAND') return false;
  return getActiveMemberships(user).length === 0;
}

export function isBrandOwner(user?: AuthUser | null, brandId?: string | null): boolean {
  const membership = brandId
    ? getActiveMemberships(user).find((entry) => entry.brandId === brandId)
    : getActiveBrandMembership(user);
  return Boolean(membership?.isOwner || membership?.role === 'OWNER');
}

export function hasBrandRole(
  user: AuthUser | null | undefined,
  roles: Iterable<BrandMemberRole>,
  brandId?: string | null,
): boolean {
  const roleSet = new Set(roles);
  const membership = brandId
    ? getActiveMemberships(user).find((entry) => entry.brandId === brandId)
    : getActiveBrandMembership(user);
  return Boolean(membership && roleSet.has(membership.role));
}

export const canManageCatalog = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, CATALOG_WRITE_ROLES, brandId);

export const canReadOrders = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, ORDERS_READ_ROLES, brandId);

export const canUpdateOrders = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, ORDERS_UPDATE_ROLES, brandId);

export const canReadMessages = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, MESSAGES_READ_ROLES, brandId);

export const canReplyMessages = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, MESSAGES_REPLY_ROLES, brandId);

export const canReadPayouts = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, PAYOUTS_READ_ROLES, brandId);
