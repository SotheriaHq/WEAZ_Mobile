import { apiClient } from './httpClient';

export interface ContentReviewDecision {
  id: string;
  status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED';
  reasonCode?: string | null;
  reasonLabel?: string | null;
  reasonNote?: string | null;
  slotCompleteness?: {
    missing?: string[];
  };
}

/** One review cycle of an item, newest first, from the owner's history. */
export interface ContentReviewHistoryItem {
  id: string;
  entityType: string;
  status: ContentReviewDecision['status'];
  reasonCode: string | null;
  reasonLabel: string | null;
  reasonNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export const contentIntegrityApi = {
  async getMySubmission(id: string): Promise<ContentReviewDecision> {
    const response = await apiClient.get(`/content-integrity/submissions/${id}`);
    return response.data?.data ?? response.data;
  },

  /** The owner's review cycles for one design or product (newest first). */
  async getMyReviewHistory(target: {
    designId?: string | null;
    productId?: string | null;
  }): Promise<ContentReviewHistoryItem[]> {
    const params: Record<string, string> = {};
    if (target.designId) params.designId = target.designId;
    if (target.productId) params.productId = target.productId;
    const response = await apiClient.get('/content-integrity/my-review-history', { params });
    const body = response.data?.data ?? response.data;
    return Array.isArray(body?.items) ? body.items : [];
  },
};
