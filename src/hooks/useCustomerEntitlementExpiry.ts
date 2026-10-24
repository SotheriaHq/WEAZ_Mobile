import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BrandCommerceAccess } from '@/src/api/BrandCustomersApi';
import { customerEntitlementRemainingMs } from '@/src/utils/customerEntitlementExpiry';

export function useCustomerEntitlementExpiry(
  access: BrandCommerceAccess | undefined,
  receivedAt: number,
  actorId: string | undefined,
  brandId: string | null | undefined,
  enabled = true,
) {
  const client = useQueryClient();
  const [expiredKey, setExpiredKey] = useState('');
  const versionKey = `${actorId}:${brandId}:${receivedAt}`;
  useEffect(() => {
    if (!enabled || !access?.canConfigureCustomers) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshAtExpiry = () => {
      const remaining = customerEntitlementRemainingMs(access, receivedAt);
      if (remaining === null) return;
      if (remaining === 0) {
        setExpiredKey(versionKey);
        void client.invalidateQueries({ queryKey: ['brand-commerce-access', actorId, brandId] }, { cancelRefetch: false });
        void client.invalidateQueries({ queryKey: ['brand-customers', actorId, brandId] }, { cancelRefetch: false });
        return;
      }
      timer = setTimeout(refreshAtExpiry, Math.min(remaining, 2_147_483_647));
    };
    refreshAtExpiry();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [enabled, access, receivedAt, actorId, brandId, client, versionKey]);
  const remaining = access?.canConfigureCustomers ? customerEntitlementRemainingMs(access, receivedAt) : null;
  return Boolean(access?.canConfigureCustomers && (expiredKey === versionKey || remaining === null || remaining === 0));
}
