import assert from 'node:assert/strict';

import type { MobileNotification } from '../src/api/NotificationsApi';
import { getNotificationGroupLabel, groupNotifications } from '../src/utils/notificationGrouping.js';

function localIso(year: number, monthIndex: number, day: number, hour = 12) {
  return new Date(year, monthIndex, day, hour, 0, 0, 0).toISOString();
}

const now = new Date(2026, 4, 1, 12, 0, 0, 0);

function makeNotification(id: string, createdAt: string): MobileNotification {
  return {
    id,
    type: 'COMMENT_CREATED',
    message: 'Test notification',
    createdAt,
    isRead: false,
  };
}

assert.equal(getNotificationGroupLabel(localIso(2026, 4, 1, 3), now), 'Today');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 30, 23), now), 'Yesterday');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 29), now), 'This week');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 27), now), 'This week');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 24), now), 'Last week');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 18), now), 'Last week');
assert.equal(getNotificationGroupLabel(localIso(2026, 3, 17), now), 'Earlier');
assert.equal(getNotificationGroupLabel('not-a-date', now), 'Earlier');

const grouped = groupNotifications(
  [
    makeNotification('n4', localIso(2026, 3, 17)),
    makeNotification('n1', localIso(2026, 4, 1, 3)),
    makeNotification('n3', localIso(2026, 3, 27)),
    makeNotification('n2', localIso(2026, 3, 30, 23)),
  ],
  now,
);

assert.deepEqual(grouped.map((group) => group.title), ['Today', 'Yesterday', 'This week', 'Earlier']);
assert.deepEqual(grouped[0]?.items.map((item) => item.id), ['n1']);
assert.deepEqual(grouped[1]?.items.map((item) => item.id), ['n2']);
assert.deepEqual(grouped[2]?.items.map((item) => item.id), ['n3']);
assert.deepEqual(grouped[3]?.items.map((item) => item.id), ['n4']);

console.log('notification grouping tests passed');