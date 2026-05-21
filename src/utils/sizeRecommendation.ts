import type {
  RecommendationConfidenceLabel,
  SizeRecommendationResponse,
  SizeRecommendationSnapshot,
  SizingRegion,
} from '@/src/api/ProfileApi';

export const SIZING_REGION_LABELS: Record<SizingRegion, string> = {
  NG_WEST_AFRICA: 'Nigeria/West Africa',
  UK: 'UK',
  US: 'US',
  EU: 'EU',
  INTERNATIONAL: 'International',
};

export const CONFIDENCE_LABELS: Record<RecommendationConfidenceLabel, string> = {
  VERY_HIGH: 'Very High',
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW: 'Low',
};

export const canUseRecommendedSize = (
  recommendation: SizeRecommendationResponse | null | undefined,
  availableSizes: string[],
) => {
  const recommended = recommendation?.recommendedSize;
  if (!recommended) return false;
  return availableSizes.length === 0 || availableSizes.includes(recommended);
};

export const buildSizeRecommendationSnapshot = (
  recommendation: SizeRecommendationResponse | null | undefined,
  selectedSize?: string | null,
): SizeRecommendationSnapshot | undefined => {
  if (!recommendation) return undefined;
  const resolvedSelectedSize = selectedSize ?? recommendation.recommendedSize ?? null;
  return {
    recommendedSize: recommendation.recommendedSize,
    selectedSize: resolvedSelectedSize,
    alternativeSize: recommendation.alternativeSize,
    displayRange: recommendation.displayRange,
    confidenceScore: recommendation.confidenceScore,
    confidenceLabel: recommendation.confidenceLabel,
    reasonSummary: recommendation.reasons ?? [],
    warningsSummary: recommendation.warnings ?? [],
    chartSource: recommendation.chartSource,
    chartId: recommendation.chartId ?? null,
    chartVersionId: recommendation.chartVersionId ?? null,
    chartVersion: recommendation.chartVersion,
    selectedRegion: recommendation.selectedRegion,
    garmentCategory: recommendation.garmentCategory,
    userFitPreference: recommendation.userFitPreference ?? null,
    productFitType: recommendation.productFitType ?? null,
    fabricStretch: recommendation.fabricStretch ?? null,
    wasManuallyChanged:
      Boolean(resolvedSelectedSize) &&
      Boolean(recommendation.recommendedSize) &&
      resolvedSelectedSize !== recommendation.recommendedSize,
    generatedAt: new Date().toISOString(),
  };
};

export const readRecommendationSnapshot = (snapshot: unknown) => {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const source = snapshot as Record<string, unknown>;
  const recommendedSize =
    typeof source.recommendedSize === 'string' && source.recommendedSize.trim()
      ? source.recommendedSize
      : null;
  const selectedSize =
    typeof source.selectedSize === 'string' && source.selectedSize.trim()
      ? source.selectedSize
      : null;
  const confidenceLabel =
    typeof source.confidenceLabel === 'string' && source.confidenceLabel in CONFIDENCE_LABELS
      ? (source.confidenceLabel as RecommendationConfidenceLabel)
      : null;
  if (!recommendedSize && !selectedSize && !confidenceLabel) return null;
  return {
    recommendedSize,
    selectedSize,
    confidenceLabel,
    confidenceText: confidenceLabel ? CONFIDENCE_LABELS[confidenceLabel] : null,
    selectedDiffers:
      Boolean(recommendedSize) && Boolean(selectedSize) && recommendedSize !== selectedSize,
  };
};
