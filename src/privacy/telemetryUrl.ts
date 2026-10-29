/**
 * Addresses as error reports may carry them: the route, never the tokens,
 * emails, references or ids inside it.
 *
 * Twin of `fthreadly/src/privacy/telemetryUrl.ts`. String-based rather than
 * `URL`, which React Native only partly implements.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE = /^(?:[A-Za-z0-9_]{24,}|[A-Za-z0-9_-]{40,})$/;
const NUMERIC = /^\d{6,}$/;
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

export const telemetryPath = (pathname: string): string =>
  pathname
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return ':token';
      }
      if (UUID.test(decoded) || NUMERIC.test(decoded)) return ':id';
      if (OPAQUE.test(decoded) || decoded.includes('@')) return ':token';
      return segment;
    })
    .join('/');

export const telemetryUrl = (value: string | null | undefined): string => {
  if (!value) return '';
  const address = value.split(/[?#]/, 1)[0] ?? '';
  const origin = address.match(ORIGIN)?.[0] ?? '';
  // Drop any user:password@ before the host.
  return origin.replace(/\/\/[^/@]*@/, '//') + telemetryPath(address.slice(origin.length));
};
