import { apiClient } from '@/src/api/httpClient';

export type ReviewTargetType = 'PRODUCT' | 'COLLECTION' | 'DESIGN' | 'CUSTOM_ORDER' | 'BRAND';
export type ReviewSatisfaction = 'NONE' | 'ANGRY' | 'SAD' | 'OKAY' | 'HAPPY' | 'EXCITED';
export type ReviewStatus = 'APPROVED' | 'PENDING_MODERATION' | 'HIDDEN' | 'FLAGGED' | 'DELETED';
export type ReviewPromptStatus = 'PENDING' | 'SHOWN' | 'SKIPPED' | 'SUBMITTED' | 'EXPIRED';

export type RatingBreakdown = { 1: number; 2: number; 3: number; 4: number; 5: number };
export type SatisfactionDistribution = Record<ReviewSatisfaction, number>;

export type ReviewSummaryDto = {
  averageRating: number;
  reviewCount: number;
  ratingBreakdown: RatingBreakdown;
  satisfactionDistribution: SatisfactionDistribution;
};

export type ReviewDto = {
  id: string;
  reviewerId: string;
  brandId: string | null;
  productId: string | null;
  collectionId: string | null;
  legacyCollectionId: string | null;
  designId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  customOrderId: string | null;
  targetType: ReviewTargetType;
  rating: number;
  satisfaction: ReviewSatisfaction;
  reviewText: string | null;
  verifiedPurchase: boolean;
  status?: ReviewStatus;
  editWindowExpiresAt: string | null;
  editedAt: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type ReviewPromptDto = {
  id: string;
  buyerId: string;
  orderId: string | null;
  orderItemId: string | null;
  customOrderId: string | null;
  productId: string | null;
  collectionId: string | null;
  legacyCollectionId: string | null;
  designId: string | null;
  brandId: string | null;
  targetType: ReviewTargetType;
  status: ReviewPromptStatus;
  shownAt: string | null;
  skippedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ReviewEligibilityTargetDto = {
  promptId?: string | null;
  buyerId: string;
  brandId?: string | null;
  productId?: string | null;
  collectionId?: string | null;
  legacyCollectionId?: string | null;
  designId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  customOrderId?: string | null;
  targetType: ReviewTargetType;
  eligible: boolean;
  reason?: string;
};

export type ReviewEligibilityDto = {
  orderId?: string;
  customOrderId?: string;
  targets: ReviewEligibilityTargetDto[];
};

export type ReviewListDto = {
  items: ReviewDto[];
  summary: ReviewSummaryDto;
  nextCursor: string | null;
};

export type SubmitReviewPayload = {
  promptId?: string;
  targetType: ReviewTargetType;
  orderId?: string | null;
  orderItemId?: string | null;
  customOrderId?: string | null;
  productId?: string | null;
  collectionId?: string | null;
  legacyCollectionId?: string | null;
  designId?: string | null;
  brandId?: string | null;
  rating: number;
  satisfaction: ReviewSatisfaction;
  reviewText?: string;
};

export type UpdateReviewPayload = {
  rating?: number;
  satisfaction?: ReviewSatisfaction;
  reviewText?: string;
};

export type ReviewQueryParams = {
  cursor?: string;
  limit?: number;
  sort?: 'newest' | 'highest_rating' | 'lowest_rating' | 'most_helpful';
  filter?: 'all' | '1' | '2' | '3' | '4' | '5' | 'with_media';
};

export class ReviewApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = 'ReviewApiError';
    this.status = options?.status;
    this.code = options?.code;
  }
}

const emptyRatingBreakdown: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const emptySatisfactionDistribution: SatisfactionDistribution = {
  NONE: 0,
  ANGRY: 0,
  SAD: 0,
  OKAY: 0,
  HAPPY: 0,
  EXCITED: 0,
};

const createIdempotencyKey = () => `mob_review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const unwrap = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
};

const dateString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
};

const normalizeError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { status?: number; data?: { message?: string | string[]; code?: string } } })?.response;
  const rawMessage = response?.data?.message;
  const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
  return new ReviewApiError(message || fallback, {
    status: response?.status,
    code: response?.data?.code || message,
  });
};

export const normalizeReview = (raw: any, viewerId?: string | null): ReviewDto => {
  const editWindowExpiresAt = dateString(raw?.editWindowExpiresAt);
  const status = raw?.status as ReviewStatus | undefined;
  const isOwner = Boolean(viewerId && raw?.reviewerId === viewerId);
  const editWindowOpen = editWindowExpiresAt ? Date.now() < new Date(editWindowExpiresAt).getTime() : false;
  const hiddenOrDeleted = status === 'DELETED' || status === 'HIDDEN';

  return {
    id: String(raw?.id ?? ''),
    reviewerId: String(raw?.reviewerId ?? ''),
    brandId: raw?.brandId ?? null,
    productId: raw?.productId ?? null,
    collectionId: raw?.collectionId ?? null,
    legacyCollectionId: raw?.legacyCollectionId ?? null,
    designId: raw?.designId ?? null,
    orderId: raw?.orderId ?? null,
    orderItemId: raw?.orderItemId ?? null,
    customOrderId: raw?.customOrderId ?? null,
    targetType: (raw?.targetType ?? 'PRODUCT') as ReviewTargetType,
    rating: Number(raw?.rating ?? 0),
    satisfaction: (raw?.satisfaction ?? 'NONE') as ReviewSatisfaction,
    reviewText: raw?.reviewText ?? null,
    verifiedPurchase: Boolean(raw?.verifiedPurchase ?? true),
    status,
    editWindowExpiresAt,
    editedAt: dateString(raw?.editedAt),
    deletedAt: dateString(raw?.deletedAt),
    createdAt: dateString(raw?.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dateString(raw?.updatedAt),
    canEdit: typeof raw?.canEdit === 'boolean' ? raw.canEdit : Boolean(isOwner && editWindowOpen && !hiddenOrDeleted),
    canDelete: typeof raw?.canDelete === 'boolean' ? raw.canDelete : Boolean(isOwner && status !== 'DELETED'),
  };
};

const normalizePrompt = (raw: any): ReviewPromptDto => ({
  id: String(raw?.id ?? ''),
  buyerId: String(raw?.buyerId ?? ''),
  orderId: raw?.orderId ?? null,
  orderItemId: raw?.orderItemId ?? null,
  customOrderId: raw?.customOrderId ?? null,
  productId: raw?.productId ?? null,
  collectionId: raw?.collectionId ?? null,
  legacyCollectionId: raw?.legacyCollectionId ?? null,
  designId: raw?.designId ?? null,
  brandId: raw?.brandId ?? null,
  targetType: (raw?.targetType ?? 'PRODUCT') as ReviewTargetType,
  status: (raw?.status ?? 'PENDING') as ReviewPromptStatus,
  shownAt: dateString(raw?.shownAt),
  skippedAt: dateString(raw?.skippedAt),
  submittedAt: dateString(raw?.submittedAt),
  expiresAt: dateString(raw?.expiresAt),
  createdAt: dateString(raw?.createdAt) ?? new Date(0).toISOString(),
  updatedAt: dateString(raw?.updatedAt),
});

const normalizeSummary = (raw: any): ReviewSummaryDto => ({
  averageRating: Number(raw?.averageRating ?? 0),
  reviewCount: Number(raw?.reviewCount ?? raw?.totalReviews ?? 0),
  ratingBreakdown: { ...emptyRatingBreakdown, ...(raw?.ratingBreakdown ?? {}) },
  satisfactionDistribution: { ...emptySatisfactionDistribution, ...(raw?.satisfactionDistribution ?? {}) },
});

const normalizeList = (raw: any, viewerId?: string | null): ReviewListDto => ({
  items: Array.isArray(raw?.items) ? raw.items.map((item: unknown) => normalizeReview(item, viewerId)) : [],
  summary: normalizeSummary(raw?.summary),
  nextCursor: raw?.nextCursor ?? null,
});

const mutationHeaders = () => ({ 'Idempotency-Key': createIdempotencyKey() });

export const reviewApi = {
  async listReviewPrompts(): Promise<ReviewPromptDto[]> {
    try {
      const response = await apiClient.get('/reviews/prompts');
      const data = unwrap<unknown[]>(response.data);
      return Array.isArray(data) ? data.map(normalizePrompt) : [];
    } catch (error) {
      throw normalizeError(error, 'Unable to load review prompts');
    }
  },

  async getReviewEligibility(params: { orderId?: string; customOrderId?: string }): Promise<ReviewEligibilityDto> {
    try {
      const response = await apiClient.get('/reviews/eligibility', { params });
      return unwrap<ReviewEligibilityDto>(response.data);
    } catch (error) {
      throw normalizeError(error, 'Unable to load review eligibility');
    }
  },

  async submitReview(payload: SubmitReviewPayload): Promise<ReviewDto> {
    try {
      const response = await apiClient.post('/reviews', payload, { headers: mutationHeaders() });
      return normalizeReview(unwrap(response.data));
    } catch (error) {
      throw normalizeError(error, 'Unable to submit review');
    }
  },

  async updateReview(reviewId: string, payload: UpdateReviewPayload): Promise<ReviewDto> {
    try {
      const response = await apiClient.patch(`/reviews/${reviewId}`, payload, { headers: mutationHeaders() });
      return normalizeReview(unwrap(response.data));
    } catch (error) {
      throw normalizeError(error, 'Unable to update review');
    }
  },

  async deleteReview(reviewId: string): Promise<void> {
    try {
      await apiClient.delete(`/reviews/${reviewId}`, { headers: mutationHeaders() });
    } catch (error) {
      throw normalizeError(error, 'Unable to delete review');
    }
  },

  async skipReviewPrompt(promptId: string): Promise<void> {
    try {
      await apiClient.post(`/reviews/prompts/${promptId}/skip`, {}, { headers: mutationHeaders() });
    } catch (error) {
      throw normalizeError(error, 'Unable to skip review prompt');
    }
  },

  async getProductReviews(productId: string, params?: ReviewQueryParams, viewerId?: string | null): Promise<ReviewListDto> {
    try {
      const response = await apiClient.get(`/reviews/product/${productId}`, { params });
      return normalizeList(unwrap(response.data), viewerId);
    } catch (error) {
      throw normalizeError(error, 'Unable to load product reviews');
    }
  },

  async getCollectionReviews(collectionId: string, params?: ReviewQueryParams, viewerId?: string | null): Promise<ReviewListDto> {
    try {
      const response = await apiClient.get(`/reviews/collection/${collectionId}`, { params });
      return normalizeList(unwrap(response.data), viewerId);
    } catch (error) {
      throw normalizeError(error, 'Unable to load collection reviews');
    }
  },

  async getDesignReviews(designId: string, params?: ReviewQueryParams, viewerId?: string | null): Promise<ReviewListDto> {
    try {
      const response = await apiClient.get(`/reviews/design/${designId}`, { params });
      return normalizeList(unwrap(response.data), viewerId);
    } catch (error) {
      throw normalizeError(error, 'Unable to load design reviews');
    }
  },

  async getBrandReviews(brandId: string, params?: ReviewQueryParams, viewerId?: string | null): Promise<ReviewListDto> {
    try {
      const response = await apiClient.get(`/reviews/brand/${brandId}`, { params });
      return normalizeList(unwrap(response.data), viewerId);
    } catch (error) {
      throw normalizeError(error, 'Unable to load brand reviews');
    }
  },

  async getBrandReviewSummary(brandId: string): Promise<ReviewSummaryDto> {
    try {
      const response = await apiClient.get(`/reviews/brand/${brandId}/summary`);
      return normalizeSummary(unwrap(response.data));
    } catch (error) {
      throw normalizeError(error, 'Unable to load brand review summary');
    }
  },
};

export default reviewApi;
