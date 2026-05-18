export type RecommendationSectionType =
  | 'moodboard_suggestions'
  | 'market_section'
  | 'runway_section'
  | 'shop_suggestions'
  | 'brand_suggestions'
  | 'new_drops';

export type RecommendationSignalKey =
  | 'tasteMatch'
  | 'socialSignal'
  | 'commerceSignal'
  | 'brandAffinity'
  | 'freshness'
  | 'diversityExploration';

export type RecommendationCandidate<T> = {
  id: string;
  item: T;
  entityType?: 'DESIGN' | 'PRODUCT' | 'COLLECTION';
  createdAt?: string | null;
  brandId?: string | null;
  categoryKeys?: string[];
  tagKeys?: string[];
  mediaReady?: boolean;
  alreadySaved?: boolean;
  hidden?: boolean;
  reported?: boolean;
  unavailable?: boolean;
  signals?: {
    tasteMatch?: number | null;
    threadCount?: number | null;
    commentCount?: number | null;
    commerceReady?: boolean | null;
    brandAffinity?: number | null;
  };
};

export type RecommendationUserProfile = {
  preferredKeys?: string[];
  brandAffinityById?: Record<string, number>;
};

export type RecommendationWeights = Partial<Record<RecommendationSignalKey, number>>;

export type RecommendationDiversityRules = {
  maxPerBrand?: number;
  maxPerCategory?: number;
};

export type ScoredRecommendation<T> = RecommendationCandidate<T> & {
  score: number;
  scoreParts: Partial<Record<RecommendationSignalKey, number>>;
  appliedWeights: Partial<Record<RecommendationSignalKey, number>>;
};

export const MOODBOARD_SUGGESTION_WEIGHTS: Required<RecommendationWeights> = {
  tasteMatch: 0.35,
  socialSignal: 0.2,
  commerceSignal: 0.15,
  brandAffinity: 0.1,
  freshness: 0.1,
  diversityExploration: 0.1,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeKey = (value: string) => value.trim().toLowerCase();

const stableExplorationScore = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
};

const freshnessScore = (createdAt?: string | null) => {
  if (!createdAt) return null;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  const ageHours = Math.max(0, (Date.now() - createdAtMs) / 3600000);
  if (ageHours <= 72) return 1;
  if (ageHours >= 24 * 30) return 0;
  return clamp01(1 - (ageHours - 72) / (24 * 27));
};

const socialScore = (threadCount?: number | null) => {
  if (typeof threadCount !== 'number' || !Number.isFinite(threadCount)) return null;
  return clamp01(Math.log1p(Math.max(0, threadCount)) / Math.log1p(50));
};

const tasteScore = <T>(
  candidate: RecommendationCandidate<T>,
  userProfile?: RecommendationUserProfile | null,
) => {
  if (typeof candidate.signals?.tasteMatch === 'number') {
    return clamp01(candidate.signals.tasteMatch);
  }
  const preferred = new Set((userProfile?.preferredKeys ?? []).map(normalizeKey));
  if (preferred.size === 0) return null;

  const candidateKeys = [
    ...(candidate.categoryKeys ?? []),
    ...(candidate.tagKeys ?? []),
  ].map(normalizeKey);
  if (candidateKeys.length === 0) return null;

  const matches = candidateKeys.filter((key) => preferred.has(key)).length;
  return clamp01(matches / Math.min(candidateKeys.length, preferred.size));
};

const brandAffinityScore = <T>(
  candidate: RecommendationCandidate<T>,
  userProfile?: RecommendationUserProfile | null,
) => {
  if (typeof candidate.signals?.brandAffinity === 'number') {
    return clamp01(candidate.signals.brandAffinity);
  }
  if (!candidate.brandId) return null;
  const value = userProfile?.brandAffinityById?.[candidate.brandId];
  return typeof value === 'number' ? clamp01(value) : null;
};

const commerceScore = <T>(candidate: RecommendationCandidate<T>) => {
  if (typeof candidate.signals?.commerceReady !== 'boolean') return null;
  return candidate.signals.commerceReady ? 1 : 0;
};

export function scoreRecommendationCandidate<T>(
  candidate: RecommendationCandidate<T>,
  options: {
    sectionType: RecommendationSectionType;
    userProfile?: RecommendationUserProfile | null;
    weights?: RecommendationWeights;
  },
): ScoredRecommendation<T> {
  const weights = options.weights ?? MOODBOARD_SUGGESTION_WEIGHTS;
  const rawParts: Partial<Record<RecommendationSignalKey, number | null>> = {
    tasteMatch: tasteScore(candidate, options.userProfile),
    socialSignal: socialScore(candidate.signals?.threadCount),
    commerceSignal: commerceScore(candidate),
    brandAffinity: brandAffinityScore(candidate, options.userProfile),
    freshness: freshnessScore(candidate.createdAt),
    diversityExploration: stableExplorationScore(candidate.id),
  };

  const availableEntries = Object.entries(rawParts).filter((entry): entry is [RecommendationSignalKey, number] => {
    const value = entry[1];
    return typeof value === 'number' && Number.isFinite(value);
  });

  const weightTotal = availableEntries.reduce((sum, [key]) => sum + (weights[key] ?? 0), 0);
  const appliedWeights: Partial<Record<RecommendationSignalKey, number>> = {};
  const scoreParts: Partial<Record<RecommendationSignalKey, number>> = {};

  if (weightTotal <= 0) {
    return { ...candidate, score: 0, scoreParts, appliedWeights };
  }

  const score = availableEntries.reduce((sum, [key, value]) => {
    const normalizedWeight = (weights[key] ?? 0) / weightTotal;
    appliedWeights[key] = normalizedWeight;
    scoreParts[key] = value;
    return sum + value * normalizedWeight;
  }, 0);

  return {
    ...candidate,
    score,
    scoreParts,
    appliedWeights,
  };
}

export function rankRecommendationCandidates<T>(
  candidates: RecommendationCandidate<T>[],
  options: {
    sectionType: RecommendationSectionType;
    userProfile?: RecommendationUserProfile | null;
    weights?: RecommendationWeights;
    diversity?: RecommendationDiversityRules;
    limit?: number;
    diagnosticsLabel?: string;
  },
) {
  const scored = candidates
    .filter((candidate) => candidate.mediaReady !== false)
    .filter((candidate) => !candidate.alreadySaved)
    .filter((candidate) => !candidate.hidden && !candidate.reported && !candidate.unavailable)
    .map((candidate) => scoreRecommendationCandidate(candidate, options))
    .sort((a, b) => b.score - a.score);

  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const result: ScoredRecommendation<T>[] = [];
  const maxPerBrand = options.diversity?.maxPerBrand ?? Number.POSITIVE_INFINITY;
  const maxPerCategory = options.diversity?.maxPerCategory ?? Number.POSITIVE_INFINITY;

  scored.forEach((candidate) => {
    const brandId = candidate.brandId ?? '';
    if (brandId && (brandCounts.get(brandId) ?? 0) >= maxPerBrand) return;

    const primaryCategory = candidate.categoryKeys?.[0] ? normalizeKey(candidate.categoryKeys[0]) : '';
    if (primaryCategory && (categoryCounts.get(primaryCategory) ?? 0) >= maxPerCategory) return;

    result.push(candidate);
    if (brandId) brandCounts.set(brandId, (brandCounts.get(brandId) ?? 0) + 1);
    if (primaryCategory) categoryCounts.set(primaryCategory, (categoryCounts.get(primaryCategory) ?? 0) + 1);
  });

  const limited = result.slice(0, options.limit ?? result.length);

  if (__DEV__ && options.diagnosticsLabel) {
    console.log('[recommendations]', {
      sectionType: options.sectionType,
      diagnosticsLabel: options.diagnosticsLabel,
      candidates: candidates.length,
      scored: scored.length,
      returned: limited.length,
      top: limited.slice(0, 5).map((item) => ({
        id: item.id,
        score: Number(item.score.toFixed(3)),
        scoreParts: item.scoreParts,
        appliedWeights: item.appliedWeights,
      })),
    });
  }

  return limited;
}

export function buildMoodboardSuggestionSection<T>(
  candidates: RecommendationCandidate<T>[],
  options: {
    userProfile?: RecommendationUserProfile | null;
    limit?: number;
  } = {},
) {
  return rankRecommendationCandidates(candidates, {
    sectionType: 'moodboard_suggestions',
    userProfile: options.userProfile,
    weights: MOODBOARD_SUGGESTION_WEIGHTS,
    diversity: {
      maxPerBrand: 2,
      maxPerCategory: 4,
    },
    limit: options.limit ?? 10,
    diagnosticsLabel: 'moodboard_suggestions',
  });
}
