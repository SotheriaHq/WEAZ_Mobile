import type { SizeChart } from '@/src/data/sizeCharts';
import type { CoreMeasurementKey } from '@/src/features/sizing/measurementCatalog';

/**
 * Where a shopper's own measurements land on a reference size chart.
 *
 * These charts are a reading aid, not the recommendation engine — a product
 * recommends from the brand's approved chart for that garment. So this answers
 * one plain question, "which row is closest to my body?", and says exactly
 * which measurements it used, so it never reads as more certain than it is.
 *
 * Pure: no React, no network. The screen supplies the numbers.
 */

/** A shopper's measurements in centimetres, keyed by measurement point. */
export type BodyMeasurementsCm = Partial<Record<CoreMeasurementKey, number>>;

export type ChartRowMatch = {
  rowIndex: number;
  /** The measurements this match was computed from — shown to the shopper. */
  basedOn: CoreMeasurementKey[];
  /** Chart columns the shopper has not measured yet. */
  missing: CoreMeasurementKey[];
  /** True when the grading measurement itself was one of them. */
  usedPrimary: boolean;
};

/**
 * The grading column counts double. A size is stepped on bust/chest (tops) or
 * waist (trousers); a row that matches the waist but misses the bust by a full
 * grade is the wrong size, and an unweighted sum would call it a tie.
 */
const PRIMARY_WEIGHT = 2;

const isUsable = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The closest row, or null when the shopper has measured none of this chart's
 * points — no match is better than a guess dressed up as one.
 *
 * Distance is RELATIVE (difference over the chart value) so a 3 cm miss on a
 * 36 cm neck weighs more than 3 cm on a 100 cm hip, which is how a garment
 * feels it. Nothing is clamped: a shopper outside the chart's range still gets
 * the nearest end, and `describeDelta` says how far past it they are.
 */
export function findClosestChartRow(
  chart: Pick<SizeChart, 'rows' | 'measureKeys' | 'primaryKey'>,
  body: BodyMeasurementsCm,
): ChartRowMatch | null {
  const basedOn = chart.measureKeys.filter((key) => isUsable(body[key]));
  if (basedOn.length === 0) return null;

  const missing = chart.measureKeys.filter((key) => !isUsable(body[key]));

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  chart.rows.forEach((row, rowIndex) => {
    let score = 0;
    for (const key of basedOn) {
      const column = chart.measureKeys.indexOf(key);
      const chartValue = row.measures[column];
      if (!isUsable(chartValue)) continue;
      const weight = key === chart.primaryKey ? PRIMARY_WEIGHT : 1;
      score += (weight * Math.abs((body[key] as number) - chartValue)) / chartValue;
    }
    // Strictly less: on a tie the smaller size wins, which is the one a
    // shopper can take in rather than the one they cannot let out.
    if (score < bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  });

  if (bestIndex < 0) return null;

  return {
    rowIndex: bestIndex,
    basedOn,
    missing,
    usedPrimary: basedOn.includes(chart.primaryKey),
  };
}

export type MeasurementDelta = {
  /** Shopper minus chart, in cm. Positive means the shopper measures more. */
  differenceCm: number;
  /** Plain words, e.g. "2 cm over" / "3 cm under" / "matches". */
  label: string;
  tone: 'match' | 'over' | 'under';
};

/** Within this, a tape measure cannot honestly tell the two apart. */
const MATCH_TOLERANCE_CM = 1;

/**
 * How the shopper's body compares with one cell of the chart.
 *
 * Worded as a measurement, not a verdict. "Over" does not mean "too small" —
 * a relaxed cut is built with ease — so this states the difference and leaves
 * the fit judgement to the shopper and the brand's chart.
 */
export function describeDelta(bodyCm: number, chartCm: number): MeasurementDelta {
  const differenceCm = bodyCm - chartCm;
  const rounded = Math.round(Math.abs(differenceCm));
  if (Math.abs(differenceCm) <= MATCH_TOLERANCE_CM) {
    return { differenceCm, label: 'matches', tone: 'match' };
  }
  return differenceCm > 0
    ? { differenceCm, label: `${rounded} cm over`, tone: 'over' }
    : { differenceCm, label: `${rounded} cm under`, tone: 'under' };
}
