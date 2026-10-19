/** Validate system links before third-party routing/URI decoding sees them. */
export function isSafeMobileNavigationPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 16384 || /[\u0000-\u001f\u007f]/.test(path)) return false;
  try {
    // The platform decoder rejects malformed encodings in linear time. Some
    // older query decoders recursively retry malformed percent sequences.
    return !decodeURIComponent(path).includes('\u0000');
  } catch {
    return false;
  }
}
