import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth/AuthContext";
import { getActiveBrandId, isBrandOwner } from "@/src/auth/brandAccess";
import { BrandCustomersApi } from "@/src/api/BrandCustomersApi";
import { useCustomerEntitlementExpiry } from "./useCustomerEntitlementExpiry";

export function useBrandCommerceAccess() {
  const { user } = useAuth();
  const brandId = getActiveBrandId(user);
  const canManage = Boolean(brandId && isBrandOwner(user));
  const query = useQuery({
    queryKey: ["brand-commerce-access", user?.id, brandId],
    queryFn: ({ signal }) => BrandCustomersApi.access(brandId!, signal),
    enabled: canManage,
    staleTime: 30_000,
    refetchOnMount: true,
  });
  const expired = useCustomerEntitlementExpiry(query.data, query.dataUpdatedAt, user?.id, brandId, canManage);
  const data = useMemo(() => !canManage ? undefined : expired && query.data ? { ...query.data, canConfigureCustomers: false, effectiveMinimumOrders: 1 } : query.data, [canManage, expired, query.data]);
  return { ...query, data, actorId: user?.id, brandId, canManage, entitlementExpired: canManage && expired };
}
