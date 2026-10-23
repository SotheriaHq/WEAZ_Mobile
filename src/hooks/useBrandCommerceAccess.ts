import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth/AuthContext";
import { getActiveBrandId, isBrandOwner } from "@/src/auth/brandAccess";
import { BrandCustomersApi } from "@/src/api/BrandCustomersApi";

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
  return { ...query, brandId, canManage };
}
