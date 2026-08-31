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

export function needsGenderPrompt(gender: ProfileGender | null | undefined): boolean {
  return gender == null;
}

export function profileGenderLabel(
  gender: ProfileGender | null | undefined,
): string | null {
  if (!gender) return null;
  return PROFILE_GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? null;
}
