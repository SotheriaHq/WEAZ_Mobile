/**
 * Shopper gender copy. Stored codes stay MALE/FEMALE; the UI never says
 * Men/Women (garment audience) or Male/Female. People identify as a man or a woman.
 */

export const PROFILE_GENDERS = [
  'MALE',
  'FEMALE',
  'NON_BINARY',
  'UNSPECIFIED',
] as const;

export type ProfileGender = (typeof PROFILE_GENDERS)[number];

export const PROFILE_GENDER_OPTIONS: ReadonlyArray<{
  value: ProfileGender;
  label: string;
}> = [
  { value: 'MALE', label: 'Man' },
  { value: 'FEMALE', label: 'Woman' },
  { value: 'NON_BINARY', label: 'Non-binary' },
  { value: 'UNSPECIFIED', label: "I'd rather not say" },
];

export const PROFILE_GENDER_PROMPT = {
  title: 'How should we size clothes for you?',
  body: 'This helps WIEZ estimate your size and show clothes that fit how you shop. You can change it later in settings.',
  question: 'Are you a…',
} as const;

export function isProfileGender(value: unknown): value is ProfileGender {
  return (
    typeof value === 'string' &&
    (PROFILE_GENDERS as readonly string[]).includes(value)
  );
}

/**
 * The sizing question is for SHOPPERS only.
 *
 * Two kinds of account never see it. Console operators (Admin/SuperAdmin)
 * cannot bag an item, place an order or hold measurements, so the question has
 * nothing to act on — and asking puts a blocking sheet over the first screen
 * they open. Brand accounts are excluded because a brand signs up to sell, and
 * being asked how to size ITS clothes on the way in misreads what the account
 * is for.
 *
 * Gender stays null on both, which is correct: we never asked. If a brand owner
 * later wants a size of their own, Settings → Size & Fit still sets it.
 *
 * Deliberate twin of `fthreadly/src/lib/profileGender.ts` — separate repos,
 * so change both or web and native start asking different people.
 */
const CONSOLE_ONLY_ROLES = new Set(['Admin', 'SuperAdmin']);
const NON_SHOPPER_ACCOUNT_TYPES = new Set(['BRAND']);

export function needsGenderPrompt(
  account:
    | {
        gender?: ProfileGender | null;
        role?: string | null;
        type?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!account) return false;
  if (account.role && CONSOLE_ONLY_ROLES.has(account.role)) return false;
  if (account.type && NON_SHOPPER_ACCOUNT_TYPES.has(account.type)) return false;
  return account.gender == null;
}

export function profileGenderLabel(
  gender: ProfileGender | null | undefined,
): string | null {
  if (!gender) return null;
  return PROFILE_GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? null;
}
