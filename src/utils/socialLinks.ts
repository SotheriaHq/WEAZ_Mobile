/**
 * Social field normalization, shared by every screen that writes brand socials.
 *
 * The API validates `socialInstagram` / `socialFacebook` / `socialTwitter` /
 * `socialWebsite` with class-validator's `@IsUrl()`. A bare handle — which is
 * exactly what our own placeholders invite ("@brand or URL", "@handle") — is
 * not a URL, so sending it raw returns 400 and the whole profile save fails.
 *
 * Web already funnels these through the same conversion before PATCHing
 * (`normalizeSocialLink` in `fthreadly/src/components/profile/EditProfileModal.tsx`);
 * mobile did not, which is why the identical form saved on web and 400'd here.
 * Keep the two in step.
 */

const URL_REGEX = /^https?:\/\//i;
const SOCIAL_HANDLE_REGEX = /^@?[A-Za-z0-9._-]{2,50}$/;

export type SocialPlatform = 'instagram' | 'facebook' | 'twitter' | 'website';

const PLATFORM_BASE: Record<SocialPlatform, string> = {
  instagram: 'https://instagram.com',
  facebook: 'https://facebook.com',
  twitter: 'https://x.com',
  website: '',
};

/** `wiez.com` → `https://wiez.com`. Leaves an already-absolute URL alone. */
export function ensureHttps(value?: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return undefined;
  if (URL_REGEX.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^https?:\/\//i, '')}`;
}

/** True for input the API's `@IsUrl()` would reject outright. */
export function isSupportedSocialValue(value?: string | null): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return true;
  return URL_REGEX.test(trimmed) || SOCIAL_HANDLE_REGEX.test(trimmed) || trimmed.includes('.');
}

/**
 * Turns whatever the user typed into something `@IsUrl()` accepts, or
 * `undefined` when the field is empty (the DTO field is optional, and an empty
 * string would itself fail validation).
 */
export function normalizeSocialLink(
  platform: SocialPlatform,
  value?: string | null,
): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return undefined;

  if (URL_REGEX.test(trimmed)) return trimmed;

  const handle = SOCIAL_HANDLE_REGEX.test(trimmed) ? trimmed.replace(/^@/, '') : trimmed;
  if (!handle) return undefined;

  const base = PLATFORM_BASE[platform];
  return base ? `${base}/${handle}` : ensureHttps(trimmed);
}
