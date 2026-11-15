import { securityIdentityFromToken } from './securityChallenge';

/** Only the explicit password command may advance this session's revision. */
export function isPasswordSessionRotation(before: string | null, after: string | null, decode: (value: string) => string): boolean {
  const previous = securityIdentityFromToken(before, decode)?.split(':');
  const replacement = securityIdentityFromToken(after, decode)?.split(':');
  if (!previous || !replacement || previous.length !== 4 || replacement.length !== 4) return false;
  const oldRevision = Number(previous[2]), newRevision = Number(replacement[2]);
  return previous[0] === replacement[0] && previous[1] === replacement[1] && previous[3] === replacement[3] &&
    Number.isSafeInteger(oldRevision) && Number.isSafeInteger(newRevision) && newRevision === oldRevision + 1;
}
