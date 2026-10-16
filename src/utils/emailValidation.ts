/**
 * Email validation utility.
 *
 * Enforces RFC 5322 compliance without permitting trailing or leading dots
 * (e.g. `jayde.@...`), consecutive dots (`..`), or malformed domain TLDs.
 */
export function isValidEmail(email: string): boolean {
  const trimmed = String(email || '').trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return false;

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  // Local part rules: no leading/trailing dot, no consecutive dots
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  // Character set allowed in local part
  if (!/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) {
    return false;
  }

  // Domain rules
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return false;
  }
  const parts = domain.split('.');
  if (parts.length < 2) return false;

  for (const part of parts) {
    if (!part || part.length > 63) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(part)) return false;
    if (part.startsWith('-') || part.endsWith('-')) return false;
  }

  const tld = parts[parts.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;

  return true;
}
