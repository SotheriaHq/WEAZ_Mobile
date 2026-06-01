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

export const contentIntegrityApi = {
  async getMySubmission(id: string): Promise<ContentReviewDecision> {
    const response = await apiClient.get(`/content-integrity/submissions/${id}`);
    return response.data?.data ?? response.data;
  },
};
