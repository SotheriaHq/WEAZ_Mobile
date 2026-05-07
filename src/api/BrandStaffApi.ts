import { apiClient } from '@/src/api/httpClient';
import type { BrandMemberRole, BrandMemberStatus } from '@/src/auth/AuthContext';

export type BrandStaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export type BrandStaffMember = {
  id: string;
  userId: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: BrandMemberRole;
  status: BrandMemberStatus;
  joinedAt: string | null;
  invitedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrandStaffInvite = {
  id: string;
  brandId: string;
  email: string;
  role: BrandMemberRole;
  status: BrandStaffInviteStatus;
  invitedById: string;
  invitedUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  inviteToken?: string;
  emailDelivery?: {
    dispatchStatus?: string;
    outboxId?: string | null;
    errorMessage?: string | null;
  };
};

export type BrandStaffListResponse = {
  members: BrandStaffMember[];
  invites: BrandStaffInvite[];
};

const unwrap = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
};

export const brandStaffApi = {
  async list(brandId: string): Promise<BrandStaffListResponse> {
    const response = await apiClient.get(`/brands/${brandId}/staff`);
    return unwrap<BrandStaffListResponse>(response.data);
  },

  async invite(brandId: string, payload: { email: string; role: BrandMemberRole }): Promise<BrandStaffInvite> {
    const response = await apiClient.post(`/brands/${brandId}/staff/invite`, payload);
    return unwrap<BrandStaffInvite>(response.data);
  },

  async cancelInvite(brandId: string, inviteId: string): Promise<BrandStaffInvite> {
    const response = await apiClient.delete(`/brands/${brandId}/staff/invites/${inviteId}`);
    return unwrap<BrandStaffInvite>(response.data);
  },

  async updateRole(brandId: string, memberId: string, role: BrandMemberRole): Promise<BrandStaffMember> {
    const response = await apiClient.patch(`/brands/${brandId}/staff/${memberId}/role`, { role });
    return unwrap<BrandStaffMember>(response.data);
  },

  async updateStatus(brandId: string, memberId: string, status: BrandMemberStatus): Promise<BrandStaffMember> {
    const response = await apiClient.patch(`/brands/${brandId}/staff/${memberId}/status`, { status });
    return unwrap<BrandStaffMember>(response.data);
  },

  async remove(brandId: string, memberId: string): Promise<BrandStaffMember> {
    const response = await apiClient.delete(`/brands/${brandId}/staff/${memberId}`);
    return unwrap<BrandStaffMember>(response.data);
  },
};
