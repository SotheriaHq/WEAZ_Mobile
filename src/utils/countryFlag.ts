/**
 * A country's flag, derived from its ISO-3166 alpha-2 code.
 *
 * Every alpha-2 code maps to a flag emoji by translating each letter into its
 * REGIONAL INDICATOR SYMBOL: 'N' + 'G' becomes U+1F1F3 U+1F1EC, which renders
 * as one flag glyph. So the flag is a pure function of the code and never
 * needs to be stored, fetched, or kept in sync.
 *
 * That matters here because the stored values were wrong: `FALLBACK_COUNTRIES`
 * carried `flag: ''` for every entry, and the only other source was
 * `flagImage`, an SVG URL from flagcdn. React Native cannot render an SVG
 * through `Image` without an extra dependency, and a remote fetch per row is
 * the wrong cost for a picker — so nothing was displayed at all.
 *
 * Emoji also matches the house rule for markers (AGENT_RULES Rule 5) and is
 * available offline and instantly.
 */

const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 'A'.charCodeAt(0);
const LETTER_Z = 'Z'.charCodeAt(0);

export function flagEmojiFromIso2(iso2: string | null | undefined): string {
  const code = String(iso2 ?? '').trim().toUpperCase();
  if (code.length !== 2) return '';

  let flag = '';
  for (const character of code) {
    const charCode = character.charCodeAt(0);
    if (charCode < LETTER_A || charCode > LETTER_Z) return '';
    flag += String.fromCodePoint(REGIONAL_INDICATOR_A + (charCode - LETTER_A));
  }
  return flag;
}

/**
 * The flag for a country option, preferring a stored value when one exists.
 *
 * Stored `flag` values are trusted when non-empty so a country whose emoji
 * needs a special case can still override, but the derived value is what
 * actually renders today.
 */
export function countryFlag(
  option: { flag?: string | null; iso2?: string | null; code?: string | null } | null | undefined,
): string {
  const stored = String(option?.flag ?? '').trim();
  if (stored) return stored;
  return flagEmojiFromIso2(option?.iso2 ?? option?.code);
}
