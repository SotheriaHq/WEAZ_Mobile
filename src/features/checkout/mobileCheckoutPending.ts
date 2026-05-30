import * as SecureStore from 'expo-secure-store';

export const MOBILE_PENDING_CHECKOUT_STORAGE_KEY =
  'threadly.mobileCheckout.pending.v1';

export type PendingMobileCheckout = {
  reference: string;
  gateway: string;
  checkoutSessionId?: string | null;
  idempotencyKey?: string | null;
  startedAt: string;
};

function normalizePendingCheckout(
  value: unknown,
): PendingMobileCheckout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const reference =
    typeof source.reference === 'string' ? source.reference.trim() : '';
  const gateway =
    typeof source.gateway === 'string' ? source.gateway.trim() : '';
  if (!reference || !gateway) {
    return null;
  }
  return {
    reference,
    gateway,
    checkoutSessionId:
      typeof source.checkoutSessionId === 'string'
        ? source.checkoutSessionId
        : null,
    idempotencyKey:
      typeof source.idempotencyKey === 'string' ? source.idempotencyKey : null,
    startedAt:
      typeof source.startedAt === 'string'
        ? source.startedAt
        : new Date().toISOString(),
  };
}

export async function savePendingMobileCheckout(
  checkout: PendingMobileCheckout,
) {
  await SecureStore.setItemAsync(
    MOBILE_PENDING_CHECKOUT_STORAGE_KEY,
    JSON.stringify(checkout),
  );
}

export async function loadPendingMobileCheckout() {
  const raw = await SecureStore.getItemAsync(
    MOBILE_PENDING_CHECKOUT_STORAGE_KEY,
  ).catch(() => null);
  if (!raw) {
    return null;
  }
  try {
    return normalizePendingCheckout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function clearPendingMobileCheckout() {
  await SecureStore.deleteItemAsync(MOBILE_PENDING_CHECKOUT_STORAGE_KEY).catch(
    () => undefined,
  );
}
