/**
 * Is this auth user equivalent to that one, for the purpose of NOT republishing
 * the auth context?
 *
 * WHY THIS EXISTS, measured rather than supposed. Four successive device
 * captures traced one defect:
 *
 *   causes=P:Auth:user+value+sessionValue×24   (the context republished 24x)
 *   userSet=updateUser:patched×24              (updateUser did it, every time)
 *   requests=0 responses=0 paths=none          (no data arrived to justify it)
 *
 * `updateUser` guarded itself by comparing the incoming PATCH against the
 * current user by reference. That guard could never fire, because normalisation
 * mints identities: `normalizeAuthFile` returns a fresh `{ id, s3Url, url }`
 * literal and `normalizeBrandMemberships` a fresh array of fresh objects. So
 * the current user always held the NORMALISED object while the patch carried
 * the RAW one off the query, and no number of comparisons could make those two
 * `Object.is`-equal. Every call produced a new user, which republished the
 * context, which rebuilt the caller, which called again — a loop with nothing
 * to stop it but how slow each pass was, which is why the JS thread was
 * unavailable for up to ten seconds at a time.
 *
 * The fix is to compare what the update PRODUCES against what is already
 * there. This function is that comparison, and it lives in its own module so
 * it can be executed by a test rather than reasoned about.
 *
 * CONSERVATIVE BY CONSTRUCTION. It returns true only for values it has
 * verified equal, and false for anything it cannot be sure about: past its
 * depth limit, mismatched types, a `Date`, a class instance, a `Map`, a
 * function. So it may let a redundant update through, which costs one render,
 * and it cannot suppress a real one, which would strand the UI on stale
 * identity. The asymmetry is deliberate and it is the right way round.
 */

/** Deep enough for user → brandMemberships[] → membership → a nested field. */
export const AUTH_USER_COMPARE_MAX_DEPTH = 4;

export function isEquivalentAuthValue(a: unknown, b: unknown, depth = 0): boolean {
  // Settles almost every field. The walk below exists only for the handful
  // that normalisation rebuilds.
  if (Object.is(a, b)) return true;
  if (depth >= AUTH_USER_COMPARE_MAX_DEPTH) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    return left.every((item, index) => isEquivalentAuthValue(item, right[index], depth + 1));
  }

  // Anything that is not a plain object is something this function does not
  // claim to understand. Say "different" and let the update through.
  if (Object.getPrototypeOf(a) !== Object.prototype) return false;
  if (Object.getPrototypeOf(b) !== Object.prototype) return false;

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      isEquivalentAuthValue(left[key], right[key], depth + 1),
  );
}

export function isEquivalentAuthUser<T>(a: T | null, b: T | null): boolean {
  return isEquivalentAuthValue(a, b, 0);
}
