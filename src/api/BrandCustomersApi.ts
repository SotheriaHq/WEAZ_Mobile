import { apiClient } from "./httpClient";

export interface BrandCommerceAccess {
  tierKey: string;
  canUpgrade: boolean;
  canConfigureCustomers: boolean;
  customerMinimumOrders: number;
  effectiveMinimumOrders: number;
  serverNow: string;
  entitlementExpiresAt: string | null;
}
const unwrap = <T>(payload: unknown): T =>
  (payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload) as T;
export const BrandCustomersApi = {
  access: async (id: string, signal?: AbortSignal) =>
    unwrap<BrandCommerceAccess>(
      (await apiClient.get(`/brands/${id}/customer-settings`, { signal })).data,
    ),
  update: async (id: string, minimumOrders: number) =>
    unwrap<BrandCommerceAccess>(
      (
        await apiClient.patch(`/brands/${id}/customer-settings`, {
          minimumOrders,
        })
      ).data,
    ),
};
