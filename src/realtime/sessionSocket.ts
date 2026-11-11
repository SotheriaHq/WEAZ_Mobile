type SessionSnapshot = { token: string; identity: string };
type SessionPort = {
  current(): SessionSnapshot | null;
  refresh(): Promise<string | null>;
  subscribe?: (listener: () => void) => () => void;
  subscribeAvailable?: (listener: () => void) => () => void;
};
type Listener = (value?: unknown) => void;
type SessionSocket = {
  auth: Record<string, unknown> | ((callback: (value: object) => void) => void);
  connected: boolean;
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
  connect(): unknown;
  disconnect(): unknown;
};

/** Reconnect with the same live session after access expiry; never import the
 * next account into an old socket. Only auth rejection/server disconnect uses
 * refresh. Socket.IO retains its own ordinary network reconnection behavior. */
export function bindSessionSocket(socket: SessionSocket, session: SessionPort): () => void {
  const initial = session.current();
  if (!initial) { socket.disconnect(); return () => undefined; }
  const identity = initial.identity;
  let activeToken = initial.token, disposed = false, recovering = false, attempted = false;
  let retryIndex = 0, retryTimer: ReturnType<typeof setTimeout> | undefined;
  const clearRetry = () => { if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined; };
  const current = () => {
    const value = session.current();
    return !disposed && value?.identity === identity ? value : null;
  };
  const setToken = (token: string) => {
    activeToken = token;
    socket.auth = { ...(typeof socket.auth === 'object' ? socket.auth : {}), token };
  };
  setToken(activeToken);
  const reconnect = () => {
    if (!current()) return;
    if (socket.connected) socket.disconnect();
    socket.connect();
  };
  const credentialsChanged = () => {
    const value = current();
    if (!value) { clearRetry(); socket.disconnect(); return; }
    if (value.token === activeToken) return;
    setToken(value.token);
    if (!recovering) { clearRetry(); retryIndex = 0; attempted = false; reconnect(); }
  };
  const retry = () => {
    if (!current() || socket.connected || retryTimer !== undefined) return;
    // Bound retry rate and retain one owned timer. Temporary server/network
    // failure must not permanently disable a server-disconnected socket.
    const delay = [1000, 3000, 10000, 30000][Math.min(retryIndex++, 3)];
    retryTimer = setTimeout(() => { retryTimer = undefined; attempted = false; void recover(); }, delay);
  };
  const recover = async () => {
    if (disposed || recovering || attempted || socket.connected || !current()) return;
    attempted = true; recovering = true;
    let reconnectStarted = false;
    try {
      const value = current();
      if (!value) return;
      const token = value.token !== activeToken ? value.token : await session.refresh();
      const latest = current();
      if (!token || !latest || latest.token !== token) return;
      setToken(token); reconnect(); reconnectStarted = true;
    } catch { /* Preserve ordinary offline retry; an old socket cannot clear auth. */ }
    finally { recovering = false; if (!reconnectStarted) retry(); }
  };
  const connected = () => { clearRetry(); retryIndex = 0; attempted = false; };
  const disconnected: Listener = reason => { if (reason === 'io server disconnect') void recover(); };
  const rejected: Listener = error => {
    if (error && typeof error === 'object' && 'message' in error && error.message === 'Unauthorized') {
      if (attempted) retry(); else void recover();
    }
  };
  socket.on('connect', connected); socket.on('disconnect', disconnected); socket.on('connect_error', rejected);
  const unsubscribe = session.subscribe?.(credentialsChanged);
  const unsubscribeAvailable = session.subscribeAvailable?.(() => {
    if (!current() || socket.connected) return;
    clearRetry(); retryIndex = 0; attempted = false; void recover();
  });
  return () => {
    disposed = true; clearRetry(); unsubscribe?.(); unsubscribeAvailable?.();
    socket.off('connect', connected); socket.off('disconnect', disconnected); socket.off('connect_error', rejected);
  };
}
