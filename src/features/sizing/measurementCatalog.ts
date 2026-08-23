/**
 * One vocabulary for measurements, shared by every surface that shows them.
 *
 * ## Why this file exists
 *
 * The server stores a measurement under SEVERAL keys at once, on purpose.
 * `MeasurementNormalizationService.normalizeRecord` keeps whatever key the
 * client sent, and then writes the canonical key AND the gendered registry key
 * for the same value:
 *
 *     storedMeasurements[entry.canonicalKey] = entry.valueCm;
 *     if (entry.registryKey) storedMeasurements[entry.registryKey] = entry.valueCm;
 *
 * That is correct for the server — brands declare required points using registry
 * keys (`MEN_CHEST`), the recommendation engine reads canonical keys
 * (`CHEST_BUST`), and both have to resolve. It is wrong to render raw. A profile
 * with eight real measurements came back as nineteen rows, listing "Height 182"
 * twice (`HEIGHT` and `MEN_HEIGHT`), "Chest Bust 45" beside "Chest Full Bust 45",
 * and "Hip 26" beside "Hip Seat 26" — one body, counted three times, presented to
 * the person whose body it is.
 *
 * So the client collapses before it renders. `collapseMeasurements` picks the
 * same winner the server's `entryPriority` would (canonical > registry > alias)
 * and yields one row per real measurement.
 *
 * ## Core vs extra
 *
 * `CORE_MEASUREMENT_SLOTS` is the server's `CANONICAL_KEYS` — the eight points
 * `SizeComputationService` actually weighs. Those are the ones worth asking a
 * shopper for up front, and the only ones that change whether a size can be
 * computed at all. Everything else a brand asks for is garment-specific and is
 * collected at order time against that garment, not hoarded on the profile.
 *
 * ## Keeping this in step with the server
 *
 * The alias table below mirrors `bthreadly/src/sizing/measurement-normalization.service.ts`.
 * Separate repos, so the duplicate is deliberate — but a canonical key or alias
 * added there must be added here, or a measurement the server understands will
 * render as a stray "extra" row on the profile.
 */

export type CoreMeasurementKey =
  | 'HEIGHT'
  | 'CHEST_BUST'
  | 'WAIST'
  | 'HIP_SEAT'
  | 'SHOULDER'
  | 'SLEEVE_LENGTH'
  | 'INSEAM'
  | 'NECK_COLLAR';

export type MeasurementSlot = {
  key: CoreMeasurementKey;
  /** Plain language. A shopper is not a pattern cutter. */
  label: string;
  /**
   * WHERE to put the tape, in the words someone would use to describe it to a
   * friend. "Inseam" is a trade word: with a bare label a shopper who does not
   * know it can only guess, and a wrong guess is worse than a blank — it makes a
   * garment that does not fit and an order nobody can explain.
   */
  hint: string;
};

/** The eight points the recommendation engine weighs, in the order a tailor takes them. */
export const CORE_MEASUREMENT_SLOTS: readonly MeasurementSlot[] = [
  { key: 'HEIGHT', label: 'Height', hint: 'Standing, head to floor, no shoes' },
  { key: 'CHEST_BUST', label: 'Chest / bust', hint: 'Around the fullest part, under the arms' },
  { key: 'WAIST', label: 'Waist', hint: 'Around the narrowest part, above the belly button' },
  { key: 'HIP_SEAT', label: 'Hips / seat', hint: 'Around the fullest part of your seat' },
  { key: 'SHOULDER', label: 'Shoulder width', hint: 'Across the back, shoulder bone to shoulder bone' },
  { key: 'SLEEVE_LENGTH', label: 'Sleeve length', hint: 'Shoulder bone to wrist, arm slightly bent' },
  { key: 'INSEAM', label: 'Inseam', hint: 'Inside the leg, crotch down to the ankle' },
  { key: 'NECK_COLLAR', label: 'Neck', hint: 'Around the base of the neck, where a collar sits' },
] as const;

export const CORE_MEASUREMENT_KEYS: readonly CoreMeasurementKey[] =
  CORE_MEASUREMENT_SLOTS.map((slot) => slot.key);

const CORE_SLOT_BY_KEY = new Map<string, MeasurementSlot>(
  CORE_MEASUREMENT_SLOTS.map((slot) => [slot.key, slot]),
);

/** Mirror of the server's `ALIASES`, keyed by `compactMeasurementKey`. */
const CORE_ALIASES: Record<string, CoreMeasurementKey> = {
  HEIGHT: 'HEIGHT',
  STATURE: 'HEIGHT',
  BODYHEIGHT: 'HEIGHT',
  UNISEXHEIGHT: 'HEIGHT',
  MENHEIGHT: 'HEIGHT',
  WOMENHEIGHT: 'HEIGHT',

  CHEST: 'CHEST_BUST',
  BUST: 'CHEST_BUST',
  FULLBUST: 'CHEST_BUST',
  CHESTBUST: 'CHEST_BUST',
  UNISEXCHEST: 'CHEST_BUST',
  CHESTFULLBUST: 'CHEST_BUST',
  MENCHEST: 'CHEST_BUST',
  WOMENCHESTFULLBUST: 'CHEST_BUST',

  WAIST: 'WAIST',
  NATURALWAIST: 'WAIST',
  UNISEXWAIST: 'WAIST',
  MENWAIST: 'WAIST',
  WOMENWAIST: 'WAIST',

  HIP: 'HIP_SEAT',
  HIPS: 'HIP_SEAT',
  SEAT: 'HIP_SEAT',
  HIPSEAT: 'HIP_SEAT',
  UNISEXHIP: 'HIP_SEAT',
  MENHIP: 'HIP_SEAT',
  WOMENHIP: 'HIP_SEAT',

  SHOULDER: 'SHOULDER',
  SHOULDERWIDTH: 'SHOULDER',
  UNISEXSHOULDER: 'SHOULDER',
  MENSHOULDER: 'SHOULDER',
  WOMENSHOULDERWIDTH: 'SHOULDER',

  SLEEVE: 'SLEEVE_LENGTH',
  SLEEVELENGTH: 'SLEEVE_LENGTH',
  SLEEVELENGTHLONG: 'SLEEVE_LENGTH',
  SLEEVELENGTHSHORT: 'SLEEVE_LENGTH',
  ARMLENGTH: 'SLEEVE_LENGTH',
  UNISEXSLEEVELENGTH: 'SLEEVE_LENGTH',
  MENSLEEVELENGTH: 'SLEEVE_LENGTH',
  WOMENSLEEVELENGTHLONG: 'SLEEVE_LENGTH',

  INSEAM: 'INSEAM',
  INSIDELEG: 'INSEAM',
  UNISEXINSEAM: 'INSEAM',
  MENINSEAM: 'INSEAM',
  WOMENINSEAM: 'INSEAM',

  NECK: 'NECK_COLLAR',
  COLLAR: 'NECK_COLLAR',
  UNISEXNECK: 'NECK_COLLAR',
  COLLARSIZE: 'NECK_COLLAR',
  NECKGIRTH: 'NECK_COLLAR',
  NECKCOLLAR: 'NECK_COLLAR',
  MENNECK: 'NECK_COLLAR',
  WOMENNECK: 'NECK_COLLAR',
};

/**
 * Hints for points that are NOT part of size computation but that a brand can
 * still ask for on a specific garment. Anything without an entry renders with
 * its label alone, which is fine — these are asked for beside the garment they
 * belong to, where the context does most of the explaining.
 */
const EXTRA_MEASUREMENT_HINTS: Record<string, string> = {
  ARMHOLE: 'Around the armhole, through the armpit',
  THIGH: 'Around the fullest part of the thigh',
  KNEE: 'Around the knee cap',
  CALF: 'Around the fullest part of the calf',
  ANKLE: 'Around the ankle bone',
  WRIST: 'Around the wrist bone',
  BICEP: 'Around the fullest part of the upper arm',
  BACKLENGTH: 'Base of the neck down to the waist',
  FRONTLENGTH: 'Base of the neck down to the waist, at the front',
  OUTSEAM: 'Outside the leg, waist down to the ankle',
  RISE: 'Crotch seam up to the waistband',
  TOPLENGTH: 'Shoulder down to where the top should end',
  TROUSERLENGTH: 'Waist down to where the trouser should end',
  DRESSLENGTH: 'Shoulder down to where the dress should end',
  SKIRTLENGTH: 'Waist down to where the skirt should end',
  UNDERBUST: 'Directly under the bust, where a band sits',
  STOMACH: 'Around the widest part of the stomach',
  NAPETOWAIST: 'Base of the neck down to the natural waist',
};

/** `MEN_SLEEVE_LENGTH_LONG` -> `MENSLEEVELENGTHLONG`. Mirrors the server's `compactKey`. */
export function compactMeasurementKey(key: string): string {
  return String(key ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** The core slot this stored key belongs to, or `null` if it is a garment-specific extra. */
export function resolveCoreMeasurementKey(key: string): CoreMeasurementKey | null {
  const upper = String(key ?? '')
    .trim()
    .toUpperCase();
  if (CORE_SLOT_BY_KEY.has(upper)) return upper as CoreMeasurementKey;
  return CORE_ALIASES[compactMeasurementKey(key)] ?? null;
}

/**
 * A human label for any measurement key.
 *
 * Gender prefixes are stripped: the brand already chose who the design is for,
 * so the shopper reads "Inseam", never "Men Inseam".
 */
export function formatMeasurementLabel(key: string): string {
  const core = resolveCoreMeasurementKey(key);
  if (core) return CORE_SLOT_BY_KEY.get(core)!.label;
  return String(key ?? '')
    .replace(/^(MEN|WOMEN|MENS|WOMENS|UNISEX)_/i, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getMeasurementHint(key: string): string | null {
  const core = resolveCoreMeasurementKey(key);
  if (core) return CORE_SLOT_BY_KEY.get(core)!.hint;
  const compact = compactMeasurementKey(
    String(key ?? '').replace(/^(MEN|WOMEN|MENS|WOMENS|UNISEX)_/i, ''),
  );
  return EXTRA_MEASUREMENT_HINTS[compact] ?? null;
}

/**
 * Raw stored values arrive as numbers, numeric strings, or `{ value, unit }`
 * objects. Returns the scalar as the user typed it — NOT converted. Scalars are
 * stored in the profile's `preferredLengthUnit`, which is why the server's
 * `profileMeasurementsInCm` converts them on read rather than trusting them.
 */
export function readMeasurementScalar(value: unknown): string | null {
  const raw =
    value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)
      ? (value as Record<string, unknown>).value
      : value;
  if (raw == null || typeof raw === 'boolean') return null;
  const parsed = Number(typeof raw === 'string' ? raw.trim() : raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // Trim a trailing `.0` so 182 does not render as "182.0".
  return String(Math.round(parsed * 10) / 10);
}

/** Mirrors the server's `entryPriority`: canonical beats registry beats alias. */
function keyPriority(key: string): number {
  const upper = String(key ?? '')
    .trim()
    .toUpperCase();
  if (CORE_SLOT_BY_KEY.has(upper)) return 3;
  if (upper.startsWith('MEN_') || upper.startsWith('WOMEN_')) return 2;
  return 1;
}

export type ExtraMeasurement = {
  /** The stored key, so a save can write back to the one the brand asked for. */
  key: string;
  label: string;
  value: string;
};

export type CollapsedMeasurements = {
  /** One entry per core slot. `null` means the shopper has not given it yet. */
  core: Record<CoreMeasurementKey, string | null>;
  /** How many of the eight are filled in. */
  coreSavedCount: number;
  /** Core slots still blank, in tailor order. */
  missingCoreKeys: CoreMeasurementKey[];
  /** Garment-specific points collected at order time, deduplicated by label. */
  extras: ExtraMeasurement[];
};

/**
 * Collapse the server's fanned-out measurement map into one row per measurement.
 *
 * Extras are deduplicated by LABEL rather than by key, because the fan-out
 * produces distinct keys that render identically ("Height" from `HEIGHT` and
 * from `MEN_HEIGHT`). Two keys that a shopper cannot tell apart must not appear
 * twice, whichever of them the brand happened to name.
 */
export function collapseMeasurements(
  measurements: Record<string, unknown> | null | undefined,
): CollapsedMeasurements {
  const core = Object.fromEntries(
    CORE_MEASUREMENT_KEYS.map((key) => [key, null]),
  ) as Record<CoreMeasurementKey, string | null>;
  const corePriority = new Map<CoreMeasurementKey, number>();
  const extrasByLabel = new Map<string, { entry: ExtraMeasurement; priority: number }>();

  for (const [rawKey, rawValue] of Object.entries(measurements ?? {})) {
    if (!rawKey || rawKey.startsWith('_')) continue;
    const value = readMeasurementScalar(rawValue);
    if (!value) continue;

    const priority = keyPriority(rawKey);
    const coreKey = resolveCoreMeasurementKey(rawKey);
    if (coreKey) {
      if (core[coreKey] == null || priority > (corePriority.get(coreKey) ?? 0)) {
        core[coreKey] = value;
        corePriority.set(coreKey, priority);
      }
      continue;
    }

    const label = formatMeasurementLabel(rawKey);
    const existing = extrasByLabel.get(label);
    if (!existing || priority > existing.priority) {
      extrasByLabel.set(label, { entry: { key: rawKey, label, value }, priority });
    }
  }

  const missingCoreKeys = CORE_MEASUREMENT_KEYS.filter((key) => core[key] == null);

  return {
    core,
    coreSavedCount: CORE_MEASUREMENT_KEYS.length - missingCoreKeys.length,
    missingCoreKeys,
    extras: Array.from(extrasByLabel.values())
      .map((held) => held.entry)
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Reinterpret typed values when the unit toggle flips.
 *
 * Stored scalars carry no unit marker — the profile's `preferredLengthUnit` is
 * the only thing that says what "182" means. Flipping the toggle without
 * touching the numbers therefore silently redefines a 182cm shopper as 182
 * INCHES, and the server's `profileMeasurementsInCm` faithfully multiplies it by
 * 2.54 into a 4.6-metre body. Converting the values keeps the toggle meaning
 * "show me this in inches" instead of "reinterpret my measurements".
 */
export function convertMeasurementValues<K extends string>(
  values: Record<K, string>,
  from: 'CM' | 'IN',
  to: 'CM' | 'IN',
): Record<K, string> {
  if (from === to) return values;
  const factor = from === 'CM' ? 1 / 2.54 : 2.54;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const parsed = Number(String(value ?? '').trim());
      if (!Number.isFinite(parsed) || parsed <= 0) return [key, value];
      return [key, String(Math.round(parsed * factor * 10) / 10)];
    }),
  ) as Record<K, string>;
}

export const MEASUREMENT_UNIT_LABELS: Record<'CM' | 'IN', string> = {
  CM: 'Centimetres',
  IN: 'Inches',
};
