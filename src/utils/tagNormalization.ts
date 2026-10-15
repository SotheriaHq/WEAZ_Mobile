export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 24;

export function normalizeTagValue(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, TAG_MAX_LENGTH);
}

export function isValidTagValue(input: string): boolean {
  const normalized = normalizeTagValue(input);
  return (
    normalized.length >= TAG_MIN_LENGTH && normalized.length <= TAG_MAX_LENGTH
  );
}

export function normalizeTagList(values: string[], maxCount = 10): string[] {
  const normalized = values.map(normalizeTagValue).filter(isValidTagValue);

  return Array.from(new Set(normalized)).slice(0, maxCount);
}
