/**
 * What to say in the "Your size" slot, and — when there is no size — why not.
 *
 * `GET /users/me/size-fit/computed` fails in two completely different ways and
 * the profile used to render both as the same sentence: "Not worked out yet —
 * fill in the points below and it appears here." For a shopper who has already
 * filled in every point that is not just unhelpful, it is untrue, and it sends
 * them back to re-enter measurements that were never the problem.
 *
 * The two failures:
 *
 *  1. **No size charts published.** `SizeComputationService.computeAgainstChart`
 *     returns `sizeChartUnavailable: true` with a warning that says so in as many
 *     words: "Standard <region> sizing charts have not been published yet ...
 *     This is a setup step on our side, not something missing from your
 *     measurements." That message was fetched on every profile load and thrown
 *     away. It is a WIEZ setup step (`prisma/seed_size_charts.ts`), not a
 *     shopper task, and the UI has to own it.
 *
 *  2. **Not enough measurements.** `missingBaselineMeasurements` names exactly
 *     which of the eight the engine still needs. Naming them beats "add your
 *     measurements", which the shopper believes they already did.
 */

import type {
  ComputedSizeFitProfile,
  MeasurementProblem,
  SizingRegion,
} from '@/src/api/ProfileApi';

import {
  formatMeasurementLabel,
  resolveCoreMeasurementKey,
  type CoreMeasurementKey,
} from './measurementCatalog';

const REGION_LABELS: Record<SizingRegion, string> = {
  NG_WEST_AFRICA: 'Nigeria / West Africa',
  UK: 'UK',
  US: 'US',
  EU: 'EU',
  INTERNATIONAL: 'International',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  VERY_HIGH: 'Very confident',
  HIGH: 'Confident',
  MODERATE: 'Fair confidence',
  LOW: 'Low confidence',
};

export type CategorySize = { category: string; label: string; size: string };

export type ComputedSizeState =
  | {
      kind: 'ready';
      size: string;
      regionLabel: string | null;
      confidenceLabel: string | null;
      categories: CategorySize[];
      stale: boolean;
    }
  | {
      kind: 'charts-unavailable';
      regionLabel: string | null;
      /** The server's own wording, so the shopper is told whose job this is. */
      message: string;
    }
  | {
      /**
       * Measurements were given, and at least one of them cannot describe a
       * body — so the engine withheld it and declined to guess. Separate from
       * `needs-measurements` because the instruction is the opposite one: not
       * "add this", but "the number in this field is wrong".
       */
      kind: 'bad-measurements';
      problems: MeasurementProblem[];
      /** Canonical keys, for highlighting the offending fields. */
      problemKeys: string[];
    }
  | {
      kind: 'needs-measurements';
      missingKeys: CoreMeasurementKey[];
      missingLabels: string[];
    };

/**
 * Every rejected measurement across the response, deduped by key.
 *
 * The audit runs per measurement, so the envelope and all five categories carry
 * the same problem list. Reading only one of them would miss the case where an
 * older server sends problems per category and not on the envelope; reading all
 * of them without deduping tells the shopper about one bad chest six times.
 */
export function collectMeasurementProblems(
  computed: ComputedSizeFitProfile | null | undefined,
): MeasurementProblem[] {
  const all = [
    ...(computed?.measurementProblems ?? []),
    ...Object.values(computed?.categoryBreakdown ?? {}).flatMap(
      (entry) => entry?.measurementProblems ?? [],
    ),
  ];
  return Array.from(
    new Map(all.map((problem) => [problem.key.toUpperCase(), problem])).values(),
  );
}

export function formatSizingRegion(region: SizingRegion | null | undefined): string | null {
  if (!region) return null;
  return REGION_LABELS[region] ?? String(region).replace(/_/g, ' ');
}

const CHART_UNAVAILABLE_FALLBACK =
  'Standard sizing charts have not been published yet, so a size cannot be estimated. That is a setup step on our side, not something missing from your measurements.';

export function resolveComputedSizeState(
  computed: ComputedSizeFitProfile | null | undefined,
): ComputedSizeState {
  const regionLabel = formatSizingRegion(computed?.preferredRegion);
  const size = computed?.estimatedSize ?? computed?.displayRange ?? null;

  if (size) {
    return {
      kind: 'ready',
      size,
      regionLabel,
      confidenceLabel: computed?.confidenceLabel
        ? (CONFIDENCE_LABELS[computed.confidenceLabel] ?? null)
        : null,
      categories: resolveCategorySizes(computed),
      stale: Boolean(computed?.staleMeasurementWarning),
    };
  }

  /*
    Charts before measurements.

    When no chart exists the engine reports EVERY weighted slot as missing,
    including ones the shopper has supplied, so trusting `missingMeasurements`
    here would tell them to re-enter what they already gave us. The chart gap is
    the real and only blocker, so it is checked first.
  */
  const breakdown = Object.values(computed?.categoryBreakdown ?? {});
  const chartlessEntry = breakdown.find((entry) => entry?.sizeChartUnavailable);
  if (chartlessEntry) {
    return {
      kind: 'charts-unavailable',
      regionLabel,
      message: chartlessEntry.warnings?.[0]?.trim() || CHART_UNAVAILABLE_FALLBACK,
    };
  }

  /*
    Bad measurements before missing ones, for the same reason charts come before
    both: `missingBaselineMeasurements` counts a withheld measurement as absent,
    so a shopper whose chest reads 45 cm would be told to "add Chest" — pointing
    them at a field that already looks filled in, which reads as the app being
    broken rather than as the number being wrong.
  */
  const problems = collectMeasurementProblems(computed);
  if (problems.length > 0) {
    return {
      kind: 'bad-measurements',
      problems,
      problemKeys: problems.map((problem) => problem.key.toUpperCase()),
    };
  }

  const missingKeys = (computed?.missingBaselineMeasurements ?? [])
    .map((key) => resolveCoreMeasurementKey(key))
    .filter((key): key is CoreMeasurementKey => Boolean(key));

  return {
    kind: 'needs-measurements',
    missingKeys,
    missingLabels: missingKeys.map((key) => formatMeasurementLabel(key)),
  };
}

/**
 * Per-garment sizes. The server has always sent `categoryBreakdown` and the
 * profile rendered none of it, so a shopper could not see that their dress size
 * and their trouser size differ — which is most of what a size profile is for.
 */
export function resolveCategorySizes(
  computed: ComputedSizeFitProfile | null | undefined,
): CategorySize[] {
  return Object.entries(computed?.categoryBreakdown ?? {})
    .map(([category, recommendation]) => ({
      category,
      label: formatCategoryLabel(category),
      size:
        recommendation?.recommendedSize ??
        recommendation?.estimatedSize ??
        recommendation?.displayRange ??
        '',
    }))
    .filter((entry) => Boolean(entry.size));
}

function formatCategoryLabel(category: string): string {
  return String(category ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
