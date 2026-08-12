/**
 * Reference body-measurement charts for the Size Guide screen.
 *
 * **These are educational reference values, not operational chart data.** Size
 * recommendations shown on a product come from approved, versioned chart rows
 * held by the backend for that specific garment. This table exists so a buyer
 * can read their own tape measure against a conventional grade and understand
 * what a label like "UK 14" or "XL" generally means — which is the one thing
 * the guide screen previously did not do anywhere.
 *
 * Measurements are BODY measurements in centimetres (not garment measurements),
 * which is the grade UK/US/EU high-street sizing is conventionally built on.
 */

export type LengthUnitPreference = 'CM' | 'IN';

export type SizeChartRow = {
  /** Alpha label (XS…4XL). Several numeric sizes can share one. */
  alpha: string;
  uk: string;
  us: string;
  eu: string;
  /** Body measurements in cm, in the order of the chart's `measureLabels`. */
  measures: number[];
};

export type SizeChart = {
  id: string;
  label: string;
  /** What the numeric columns are, e.g. ['Bust', 'Waist', 'Hip']. */
  measureLabels: string[];
  rows: SizeChartRow[];
  /** How to take each measurement, same order as `measureLabels`. */
  howToMeasure: string[];
};

export const SIZE_CHARTS: SizeChart[] = [
  {
    id: 'women-tops',
    label: "Women's tops & dresses",
    measureLabels: ['Bust', 'Waist', 'Hip'],
    rows: [
      { alpha: 'XS', uk: '6', us: '2', eu: '34', measures: [78, 60, 86] },
      { alpha: 'S', uk: '8', us: '4', eu: '36', measures: [82, 64, 90] },
      { alpha: 'S', uk: '10', us: '6', eu: '38', measures: [87, 69, 95] },
      { alpha: 'M', uk: '12', us: '8', eu: '40', measures: [92, 74, 100] },
      { alpha: 'L', uk: '14', us: '10', eu: '42', measures: [97, 79, 105] },
      { alpha: 'L', uk: '16', us: '12', eu: '44', measures: [102, 84, 110] },
      { alpha: 'XL', uk: '18', us: '14', eu: '46', measures: [108, 90, 116] },
      { alpha: 'XXL', uk: '20', us: '16', eu: '48', measures: [114, 96, 122] },
      { alpha: '3XL', uk: '22', us: '18', eu: '50', measures: [120, 102, 128] },
      { alpha: '4XL', uk: '24', us: '20', eu: '52', measures: [126, 108, 134] },
    ],
    howToMeasure: [
      'Bust — around the fullest part of the chest, tape level and not pulled tight.',
      'Waist — around the narrowest part of the torso, usually just above the navel.',
      'Hip — around the fullest part of the seat, feet together.',
    ],
  },
  {
    id: 'men-tops',
    label: "Men's tops & shirts",
    measureLabels: ['Chest', 'Waist', 'Neck'],
    rows: [
      { alpha: 'XS', uk: '34', us: '34', eu: '44', measures: [86, 71, 36] },
      { alpha: 'S', uk: '36', us: '36', eu: '46', measures: [91, 76, 37] },
      { alpha: 'M', uk: '38', us: '38', eu: '48', measures: [97, 81, 39] },
      { alpha: 'M', uk: '40', us: '40', eu: '50', measures: [102, 86, 40] },
      { alpha: 'L', uk: '42', us: '42', eu: '52', measures: [107, 91, 41] },
      { alpha: 'XL', uk: '44', us: '44', eu: '54', measures: [112, 97, 43] },
      { alpha: 'XXL', uk: '46', us: '46', eu: '56', measures: [117, 102, 44] },
      { alpha: 'XXL', uk: '48', us: '48', eu: '58', measures: [122, 107, 45] },
      { alpha: '3XL', uk: '50', us: '50', eu: '60', measures: [127, 112, 46] },
    ],
    howToMeasure: [
      'Chest — around the fullest part, under the arms, tape level across the back.',
      'Waist — around the natural waist, where trousers normally sit.',
      'Neck — around the base of the neck, one finger of ease under the tape.',
    ],
  },
  {
    id: 'bottoms',
    label: 'Trousers & skirts',
    measureLabels: ['Waist', 'Hip', 'Inseam'],
    rows: [
      { alpha: 'XS', uk: '6', us: '2', eu: '34', measures: [60, 86, 76] },
      { alpha: 'S', uk: '8', us: '4', eu: '36', measures: [64, 90, 77] },
      { alpha: 'S', uk: '10', us: '6', eu: '38', measures: [69, 95, 78] },
      { alpha: 'M', uk: '12', us: '8', eu: '40', measures: [74, 100, 79] },
      { alpha: 'L', uk: '14', us: '10', eu: '42', measures: [79, 105, 80] },
      { alpha: 'L', uk: '16', us: '12', eu: '44', measures: [84, 110, 81] },
      { alpha: 'XL', uk: '18', us: '14', eu: '46', measures: [90, 116, 81] },
      { alpha: 'XXL', uk: '20', us: '16', eu: '48', measures: [96, 122, 82] },
      { alpha: '3XL', uk: '22', us: '18', eu: '50', measures: [102, 128, 82] },
    ],
    howToMeasure: [
      'Waist — around where the waistband will sit, not necessarily the narrowest point.',
      'Hip — around the fullest part of the seat, feet together.',
      'Inseam — from the crotch seam down the inside leg to the ankle bone.',
    ],
  },
];

const CM_PER_INCH = 2.54;

/** Renders a cm value in the requested unit, rounded the way a tape is read. */
export function formatMeasurement(
  centimetres: number,
  unit: LengthUnitPreference,
): string {
  if (unit === 'CM') return `${Math.round(centimetres)}`;
  // Half-inch resolution: finer than a garment grade needs, coarse enough that
  // the column stays readable.
  const inches = Math.round((centimetres / CM_PER_INCH) * 2) / 2;
  return Number.isInteger(inches) ? `${inches}` : inches.toFixed(1);
}
