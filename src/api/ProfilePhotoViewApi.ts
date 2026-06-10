import { apiClient } from '@/src/api/httpClient';
import type { ProfilePhotoViewState } from '@/src/types/profilePhoto';

function unwrap<T>(payload: unknown): T {
  const maybe = payload as { data?: unknown } | null | undefined;
  return (maybe?.data ?? payload) as T;
}

export const ProfilePhotoViewApi = {
  async getViewState(ownerId: string): Promise<ProfilePhotoViewState> {
    const response = await apiClient.get(`/users/${ownerId}/profile-photo-view`);
    return unwrap<ProfilePhotoViewState>(response.data);
  },

  async markViewed(ownerId: string): Promise<ProfilePhotoViewState> {
    const response = await apiClient.post(`/users/${ownerId}/profile-photo-view`);
    return unwrap<ProfilePhotoViewState>(response.data);
  },
};
