import type { MobileNotification } from '@/src/api/NotificationsApi';

export type NotificationGroup = {
  title: string;
  items: MobileNotification[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localDayTimestamp(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

export function getNotificationGroupLabel(dateValue: string, now = new Date()) {
  const target = new Date(dateValue);
  const targetTimestamp = target.getTime();
  if (Number.isNaN(targetTimestamp)) return 'Earlier';

  const dayDifference = Math.max(0, Math.floor((localDayTimestamp(now) - localDayTimestamp(target)) / DAY_MS));

  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  if (dayDifference <= 6) return 'This week';
  if (dayDifference <= 13) return 'Last week';
  return 'Earlier';
}

export function groupNotifications(items: MobileNotification[], now = new Date()): NotificationGroup[] {
  const ordered = [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt) || 0;
    const bTime = Date.parse(b.createdAt) || 0;
    return bTime - aTime;
  });
  const buckets = new Map<string, MobileNotification[]>();

  ordered.forEach((item) => {
    const label = getNotificationGroupLabel(item.createdAt, now);
    const current = buckets.get(label) ?? [];
    current.push(item);
    buckets.set(label, current);
  });

  return Array.from(buckets.entries()).map(([title, grouped]) => ({ title, items: grouped }));
}