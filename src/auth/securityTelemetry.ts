const privateKey = /password|secret|token|proof|authori[sz]ation|cookie|credential|recovery[-_]?codes?|enrollment|evidenceReference|^(?:code|otp|pin|uri)$/i;

/** MFA material can be nested in Axios configs or serialized request bodies. */
export function scrubSecurityTelemetry<T>(value: T): T {
  const scrub = (entry: unknown, depth: number): unknown => {
    if (typeof entry === 'string') {
      if (entry.length > 65_536) return '<redacted-oversize-value>';
      const first = entry.trimStart().charAt(0);
      if (first === '{' || first === '[') {
        try { return JSON.stringify(scrub(JSON.parse(entry), depth + 1)); } catch { /* Non-JSON diagnostic text follows below. */ }
      }
      return entry.replace(/otpauth:\/\/[^\s"'<>]+/gi, '<authenticator-setup>')
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\.[A-Za-z0-9_-]{43}\b/gi, '<one-use-proof>')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<access-token>')
        .replace(/\b[A-F0-9]{4}(?:-[A-F0-9]{4}){7}\b/gi, '<recovery-code>')
        .replace(/\b(password|secret|enrollmentProof|actionProof)(\s*[:=]\s*)[^\s,;&"']+/gi, '$1$2<redacted>')
        .replace(/\b(code|otp|pin)(\s+(?:is\s+)?|\s*[:=]\s*)\d{6,8}\b/gi, '$1 <code>');
    }
    if (!entry || typeof entry !== 'object') return entry;
    if (depth >= 6) return '<redacted-depth-limit>';
    if (Array.isArray(entry)) return entry.map(item => scrub(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(entry))
      result[key] = privateKey.test(key) ? '<redacted>' : scrub(item, depth + 1);
    return result;
  };
  return scrub(value, 0) as T;
}
