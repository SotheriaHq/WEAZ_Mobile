/**
 * The banner the billing screen shows while a plan is ending, has lapsed, or
 * is about to shrink (owner, Nov 2026: "ensure the user is notified as much
 * as possible, giving the user the option to subscribe or make plans … at
 * least be aware on all fronts"). The inbox, push and email say the same from
 * the backend (bthreadly src/subscriptions/subscription-notices.ts).
 *
 * A cancelled renewal can't be undone while the plan runs — choosing the same
 * plan again changes nothing — so the banner offers what does work: subscribe
 * again when it ends, or move to a bigger plan now.
 */

export type PlanNoticeSubscription = {
  tierKey: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingTierKey?: string | null;
  recoveryUntil?: string | null;
};

export type PlanNoticeTier = { tierKey: string; maxActive: number | null };

export type PlanNotice = {
  tone: 'warning' | 'info';
  title: string;
  body: string;
  actionLabel: string;
};

const DAY_MS = 86_400_000;

/** Inside this many days an ending plan is a warning, not just information. */
export const PLAN_ENDING_WARNING_DAYS = 7;
/** Inside this many days a scheduled smaller plan is a warning. */
export const DOWNGRADE_WARNING_DAYS = 3;

export const FREE_PLAN_LINE =
  'the free plan: 1 active custom order at a time. Orders already active continue, and orders waiting keep their place and move up one at a time';

const LAGOS_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A date as the billing notices write it: Lagos time, "13 Nov 2026". */
export function lagosDay(iso: string): string {
  return LAGOS_DAY.format(new Date(iso));
}

/** Whole days left, rounded up: anything under a day is one. */
export function daysLeft(iso: string, now: number): number {
  return Math.max(1, Math.ceil((Date.parse(iso) - now) / DAY_MS));
}

const within = (days: number) => (days <= 1 ? 'within a day' : `in ${days} days`);

const seats = (active: number | null | undefined) =>
  active === null || active === undefined
    ? 'more active orders'
    : `${active} active custom orders at a time`;

export function planNotice(
  subscription: PlanNoticeSubscription | null | undefined,
  tiers: PlanNoticeTier[],
  tierName: (key?: string | null) => string,
  now: number = Date.now(),
): PlanNotice | null {
  if (!subscription) return null;
  const name = tierName(subscription.tierKey);
  const current = tiers.find((tier) => tier.tierKey === subscription.tierKey);
  const active = current ? current.maxActive : undefined;
  const canUpgrade =
    active !== null &&
    active !== undefined &&
    tiers.some((tier) => tier.maxActive === null || tier.maxActive > active);
  const ended = Date.parse(subscription.currentPeriodEnd) <= now;

  if (subscription.status === 'PAST_DUE') {
    const recover = subscription.recoveryUntil
      ? ` Recover it by ${lagosDay(subscription.recoveryUntil)} (Lagos time) at your current price to get ${seats(active)} back: pay for your plan below, or check the card used for the automatic retries.`
      : ' Pay for your plan below, or check the card used for the automatic retries.';
    return {
      tone: 'warning',
      title: `Your ${name} renewal didn’t go through`,
      body: `Until it is recovered, your brand is on ${FREE_PLAN_LINE}.${recover}`,
      actionLabel: 'See plans',
    };
  }

  if (subscription.status === 'CANCELLED' || (ended && subscription.cancelAtPeriodEnd)) {
    return {
      tone: 'warning',
      title: 'Your brand is now on the free plan',
      body: `Your ${name} plan has ended, so your brand is on ${FREE_PLAN_LINE}. Subscribe again below to get ${seats(active)} back.`,
      actionLabel: 'See plans',
    };
  }

  if (subscription.status !== 'ACTIVE' || ended) return null;
  const end = subscription.currentPeriodEnd;
  const days = daysLeft(end, now);

  if (subscription.cancelAtPeriodEnd) {
    const soon = days <= PLAN_ENDING_WARNING_DAYS;
    return {
      tone: soon ? 'warning' : 'info',
      title: soon
        ? `Your ${name} plan ends ${within(days)}`
        : `Your ${name} plan ends on ${lagosDay(end)}`,
      body: `Renewal is cancelled, so on ${lagosDay(end)} (Lagos time) your brand moves to ${FREE_PLAN_LINE}. To get ${seats(active)} back, subscribe again when it ends${canUpgrade ? ', or move to a bigger plan now' : ''}.`,
      actionLabel: 'See plans',
    };
  }

  // A lower tier is scheduled for the next renewal (upgrades apply at once).
  if (subscription.pendingTierKey && subscription.pendingTierKey !== subscription.tierKey) {
    const next = tiers.find((tier) => tier.tierKey === subscription.pendingTierKey);
    const nextName = tierName(subscription.pendingTierKey);
    const soon = days <= DOWNGRADE_WARNING_DAYS;
    return {
      tone: soon ? 'warning' : 'info',
      title: soon
        ? `Your plan changes to ${nextName} ${within(days)}`
        : `Your plan changes to ${nextName} on ${lagosDay(end)}`,
      body: `On ${lagosDay(end)} (Lagos time) your plan changes from ${name} to ${nextName}${next ? `: ${seats(next.maxActive)}` : ''}. Orders already active continue, and extra waiting orders move up as seats free.`,
      actionLabel: 'See plans',
    };
  }

  return null;
}
