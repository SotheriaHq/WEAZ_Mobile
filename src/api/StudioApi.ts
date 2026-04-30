import { apiClient } from '@/src/api/httpClient';

type StudioHandoffResponse = {
  code: string;
  expiresAt: string;
  intendedPath: string;
};

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const StudioApi = {
  async createHandoff(intendedPath: string): Promise<StudioHandoffResponse> {
    const response = await apiClient.post('/auth/studio-handoff', { intendedPath });
    return unwrapData<StudioHandoffResponse>(response.data);
  },
};

export default StudioApi;
