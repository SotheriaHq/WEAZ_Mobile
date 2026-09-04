import type { AuthUser, BrandMemberRole } from '@/src/auth/AuthContext';

const ACTIVE_STATUS = 'ACTIVE';

const CATALOG_WRITE_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'CATALOG_MANAGER',
]);
const ORDERS_READ_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'ORDER_MANAGER',
  'SUPPORT_AGENT',
  'VIEWER',
]);
const ORDERS_UPDATE_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'ORDER_MANAGER',
]);
const MESSAGES_READ_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'SUPPORT_AGENT',
]);
const MESSAGES_REPLY_ROLES = new Set<BrandMemberRole>([
  'OWNER',
  'MANAGER',
  'SUPPORT_AGENT',
]);
const PAYOUTS_READ_ROLES = new Set<BrandMemberRole>(['OWNER']);

const getActiveMemberships = (user?: Pick<AuthUser, 'brandMemberships'> | null) =>
  (Array.isArray(user?.brandMemberships) ? user.brandMemberships : []).filter(
    (membership) => membership.status === ACTIVE_STATUS,
  );

export function getActiveBrandMembership(user?: AuthUser | null) {
  const activeMemberships = getActiveMemberships(user);
  if (activeMemberships.length === 0) {
    if (user?.type === 'BRAND' && user.activeBrandId) {
      return {
        brandId: user.activeBrandId,
        brandName: user.brandFullName ?? '',
        role: 'OWNER' as const,
        status: 'ACTIVE' as const,
        isOwner: true,
      };
    }
    return null;
  }

  return (
    activeMemberships.find((membership) => membership.brandId === user?.activeBrandId) ??
    activeMemberships[0] ??
    null
  );
}

export function getActiveBrandId(user?: AuthUser | null): string | null {
  return getActiveBrandMembership(user)?.brandId ?? user?.activeBrandId ?? null;
}

export function hasActiveBrandMembership(user?: AuthUser | null): boolean {
  return Boolean(getActiveBrandMembership(user));
}

/**
 * Is this account a BRAND — regardless of how far through setup it is?
 *
 * Two different questions were being answered by `hasActiveBrandMembership`,
 * and only one of them is about identity:
 *
 *   CAPABILITY — "can this account manage a store right now?" False for a brand
 *   that has not created one is correct, and the bagging guards rely on it.
 *
 *   IDENTITY — "whose UI is this?" A brand that signed up an hour ago is still
 *   a brand and must never be shown shopper UI.
 *
 * `getActiveBrandMembership` synthesizes a membership for a BRAND account only
 * when `activeBrandId` is set, so a freshly verified brand reads as a shopper.
 * The island's Profile chip picks its destination from this, which is how a
 * brand ended up on `/me` — the shopper screen — right after verifying its
 * email, where it then requested buyer-only endpoints and the API answered
 * `400 Endpoint requires user type REGULAR`.
 *
 * Use THIS for identity and `hasActiveBrandMembership` for capability. Never
 * substitute one for the other.
 *
 * Deliberate twin of `fthreadly/src/lib/brandAccess.ts` — separate repos, so
 * change both or web and native disagree about who a brand is.
 */
export function isBrandAccount(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.type === 'BRAND' || hasActiveBrandMembership(user);
}

export function isBrandOwner(user?: AuthUser | null, brandId?: string | null): boolean {
  const membership = brandId
    ? getActiveMemberships(user).find((entry) => entry.brandId === brandId)
    : getActiveBrandMembership(user);
  return Boolean(membership?.isOwner || membership?.role === 'OWNER');
}

export function hasBrandRole(
  user: AuthUser | null | undefined,
  roles: Iterable<BrandMemberRole>,
  brandId?: string | null,
): boolean {
  const roleSet = new Set(roles);
  const membership = brandId
    ? getActiveMemberships(user).find((entry) => entry.brandId === brandId)
    : getActiveBrandMembership(user);
  return Boolean(membership && roleSet.has(membership.role));
}

export const canManageCatalog = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, CATALOG_WRITE_ROLES, brandId);

export const canReadOrders = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, ORDERS_READ_ROLES, brandId);

export const canUpdateOrders = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, ORDERS_UPDATE_ROLES, brandId);

export const canReadMessages = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, MESSAGES_READ_ROLES, brandId);

export const canReplyMessages = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, MESSAGES_REPLY_ROLES, brandId);

export const canReadPayouts = (user?: AuthUser | null, brandId?: string | null) =>
  hasBrandRole(user, PAYOUTS_READ_ROLES, brandId);
