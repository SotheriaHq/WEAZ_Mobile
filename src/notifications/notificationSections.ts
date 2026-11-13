import type {
  NotificationSettings,
  NotificationSettingsSection,
} from '@/src/notifications/notificationSettings';

/**
 * The notification settings, split into an overview and one screen per
 * section.
 *
 * Everything used to live on a single long screen: the push switch, delivery
 * options, this phone's status, quiet hours and three category groups — well
 * over twenty controls to scroll past to change one. The overview now shows the
 * push switch and one row per section with a summary of where it stands, and
 * each row opens a screen holding only that section.
 */

export type NotificationToggle = {
  id: string;
  label: string;
  /** Optional: a row whose label already says it needs no second sentence. */
  description?: string;
  section: NotificationSettingsSection;
  key: string;
};

export type NotificationSectionId =
  | 'alerts'
  | 'quiet-hours'
  | 'device'
  | 'activity'
  | 'commerce'
  | 'messaging'
  | 'security'
  | 'reviews'
  | 'fit';

export type NotificationSectionGroup = 'phone' | 'topics';

export type NotificationSectionConfig = {
  id: NotificationSectionId;
  group: NotificationSectionGroup;
  title: string;
  emoji: string;
  /** One sentence under the title on the section's own screen. */
  description: string;
  /** Only meaningful while push is on: hidden from the overview when it is off. */
  requiresPush: boolean;
  items: NotificationToggle[];
};

export const PUSH_MASTER_TOGGLE: NotificationToggle = {
  id: 'push.enabled',
  label: 'Push notifications',
  description: 'Allow WIEZ to send push notifications to this phone.',
  section: 'push',
  key: 'enabled',
};

export const QUIET_HOURS_TOGGLE: NotificationToggle = {
  id: 'push.quietHoursEnabled',
  label: 'Quiet hours',
  description: 'Pause non-urgent push notifications every day between the times you choose.',
  section: 'push',
  key: 'quietHoursEnabled',
};

const ALERT_ITEMS: NotificationToggle[] = [
  {
    id: 'push.showPreview',
    label: 'Show previews',
    description: 'Show what a notification says on the lock screen and in banners.',
    section: 'push',
    key: 'showPreview',
  },
  {
    id: 'push.sound',
    label: 'Sound',
    description: 'Play a sound when a notification arrives.',
    section: 'push',
    key: 'sound',
  },
  {
    id: 'push.vibration',
    label: 'Vibration',
    description: 'Vibrate when a notification arrives.',
    section: 'push',
    key: 'vibration',
  },
];

const ACTIVITY_ITEMS: NotificationToggle[] = [
  { id: 'comments.fromUnpatchedUsers', label: 'Comments from unpatched users', description: 'Include comment notifications from people you have not patched.', section: 'comments', key: 'fromUnpatchedUsers' },
  { id: 'tags.fromUnpatchedUsers', label: 'Tags from unpatched users', description: 'Include tag notifications from people you have not patched.', section: 'tags', key: 'fromUnpatchedUsers' },
  { id: 'comments.enabled', label: 'Comments', description: 'Activity on your designs, products and posts.', section: 'comments', key: 'enabled' },
  { id: 'comments.replies', label: 'Replies', description: 'Replies to your comment threads.', section: 'comments', key: 'replies' },
  { id: 'social.follows', label: 'Profile patches', description: 'When someone patches you or shows interest in your profile.', section: 'social', key: 'follows' },
  { id: 'social.threads', label: 'Threads', description: 'When someone threads your content.', section: 'social', key: 'threads' },
  { id: 'social.patches', label: 'Brand patches', description: 'Patch requests and accepted patches.', section: 'social', key: 'patches' },
  { id: 'tags.mentions', label: 'Tags and mentions', description: 'When you are mentioned or tagged.', section: 'tags', key: 'mentions' },
];

const COMMERCE_ITEMS: NotificationToggle[] = [
  { id: 'orders.placed', label: 'Order placed', description: 'Confirmation after a checkout succeeds.', section: 'orders', key: 'placed' },
  { id: 'orders.statusChanges', label: 'Order updates', description: 'Processing, shipped, delivered, return and refund updates.', section: 'orders', key: 'statusChanges' },
  { id: 'collections.lifecycle', label: 'Collection updates', description: 'Published, unpublished and deleted collections.', section: 'collections', key: 'lifecycle' },
  { id: 'collections.access', label: 'Private access', description: 'Requests, approvals and revocations for private collections.', section: 'collections', key: 'access' },
  { id: 'brand.patchRequests', label: 'Brand patch requests', description: 'Connection requests from other brands.', section: 'brand', key: 'patchRequests' },
  { id: 'brand.contributions', label: 'Contributions', description: 'Contribution invites and collaboration activity.', section: 'brand', key: 'contributions' },
  { id: 'brand.verificationPrompts', label: 'Verification reminders', description: 'Brand verification reminders and review prompts.', section: 'brand', key: 'verificationPrompts' },
];

const MESSAGING_ITEMS: NotificationToggle[] = [
  { id: 'messaging.desktop', label: 'Browser message alerts', description: 'Show browser notifications while WIEZ is open in the background, when browser permission allows.', section: 'messaging', key: 'desktop' },
  { id: 'messaging.newMessages', label: 'New messages', description: 'New order and support messages.', section: 'messaging', key: 'newMessages' },
  { id: 'messaging.reminders', label: 'Unread reminders', description: 'Reminders about conversations you have not read.', section: 'messaging', key: 'reminders' },
  { id: 'messaging.moderation', label: 'Moderation notices', description: 'Visibility and moderation changes on your conversations.', section: 'messaging', key: 'moderation' },
  { id: 'messaging.sound', label: 'Message sounds', description: 'Play a sound for message alerts.', section: 'messaging', key: 'sound' },
  {
    id: 'messaging.readReceipts',
    label: 'Read receipts',
    description: 'On: your sent messages show coloured ticks once read, and others see when you read theirs. Off for you means off both ways.',
    section: 'messaging',
    key: 'readReceipts',
  },
  {
    id: 'messaging.deliveryReceipts',
    label: 'Delivery receipts',
    description: 'On: sent messages show double ticks once delivered. Off for you means single ticks both ways.',
    section: 'messaging',
    key: 'deliveryReceipts',
  },
];

export const NOTIFICATION_SECTIONS: readonly NotificationSectionConfig[] = [
  { id: 'security', group: 'topics', title: 'Security alerts', emoji: '🔐', requiresPush: false,
    description: 'In-app sign-in and sign-out alerts. Security emails are managed separately.', items: [
      { id: 'security.login', label: 'Sign-in alerts', section: 'security', key: 'login' },
      { id: 'security.logout', label: 'Sign-out alerts', section: 'security', key: 'logout' },
    ] },
  { id: 'reviews', group: 'topics', title: 'Reviews', emoji: '⭐', requiresPush: false,
    description: 'Review reminders, replies and moderation updates.', items: [
      { id: 'reviews.reminders', label: 'Review reminders', section: 'reviews', key: 'reminders' },
      { id: 'reviews.replies', label: 'Review replies', section: 'reviews', key: 'replies' },
      { id: 'reviews.moderation', label: 'Review moderation', section: 'reviews', key: 'moderation' },
    ] },
  { id: 'fit', group: 'topics', title: 'Fitting updates', emoji: '📏', requiresPush: false,
    description: 'Measurement reminders and fitting-profile sharing updates.', items: [
      { id: 'fit.reminders', label: 'Measurement reminders', section: 'fit', key: 'reminders' },
      { id: 'fit.shares', label: 'Fitting-profile sharing', section: 'fit', key: 'shares' },
      { id: 'fit.approvals', label: 'Sharing approvals', section: 'fit', key: 'approvals' },
    ] },
  {
    id: 'alerts',
    group: 'phone',
    title: 'Alerts',
    emoji: '🔔',
    description: 'How notifications look and sound on this phone.',
    requiresPush: true,
    items: ALERT_ITEMS,
  },
  {
    id: 'quiet-hours',
    group: 'phone',
    title: 'Quiet hours',
    emoji: '🌙',
    description: 'A daily window when non-urgent push notifications are paused (UTC).',
    requiresPush: true,
    items: [QUIET_HOURS_TOGGLE],
  },
  {
    id: 'device',
    group: 'phone',
    title: 'This phone',
    emoji: '📱',
    description: 'Whether push notifications can reach this phone, step by step.',
    requiresPush: true,
    items: [],
  },
  {
    id: 'activity',
    group: 'topics',
    title: 'Activity',
    emoji: '💬',
    description: 'Comments, replies, patches, threads and mentions.',
    requiresPush: false,
    items: ACTIVITY_ITEMS,
  },
  {
    id: 'commerce',
    group: 'topics',
    title: 'Orders and brand',
    emoji: '📦',
    description: 'Orders, collections and brand activity.',
    requiresPush: false,
    items: COMMERCE_ITEMS,
  },
  {
    id: 'messaging',
    group: 'topics',
    title: 'Messages',
    emoji: '✉️',
    description: 'Message alerts, and the receipts others see.',
    requiresPush: false,
    items: MESSAGING_ITEMS,
  },
];

const SECTION_BY_ID = new Map(NOTIFICATION_SECTIONS.map((section) => [section.id, section]));

export function getNotificationSection(id: unknown): NotificationSectionConfig | null {
  return typeof id === 'string' ? SECTION_BY_ID.get(id as NotificationSectionId) ?? null : null;
}

export function readToggle(settings: NotificationSettings, item: NotificationToggle): boolean {
  return Boolean((settings[item.section] as Record<string, unknown> | undefined)?.[item.key]);
}

/** The sections the overview lists. Push-only sections leave with the push switch. */
export function visibleNotificationSections(
  settings: Pick<NotificationSettings, 'push'>,
): NotificationSectionConfig[] {
  const pushOn = settings.push.enabled === true;
  return NOTIFICATION_SECTIONS.filter((section) => pushOn || !section.requiresPush);
}

export type DeviceSummaryInput = {
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  phone: 'ready' | 'needs-app-update' | 'failed' | 'waiting-for-permission' | 'not-checked';
  server: 'saved' | 'failed' | 'waiting' | 'not-checked';
};

/**
 * The one line under a section's title on the overview: where it stands now,
 * without opening it.
 */
export function summarizeNotificationSection(
  section: NotificationSectionConfig,
  settings: NotificationSettings,
  device?: DeviceSummaryInput,
): string {
  if (section.id === 'quiet-hours') {
    const push = settings.push;
    if (!push.quietHoursEnabled) return 'Off';
    if (push.quietHoursStart && push.quietHoursEnd) return `${push.quietHoursStart} – ${push.quietHoursEnd}`;
    return 'On · choose the times';
  }
  if (section.id === 'device') {
    if (!device) return 'Checking…';
    if (device.permission === 'denied') return 'Off in phone settings';
    if (device.phone === 'not-checked' || device.server === 'not-checked') return 'Checking…';
    if (device.phone === 'ready' && device.server === 'saved') return 'Ready';
    return 'Needs attention';
  }
  const total = section.items.length;
  const on = section.items.filter((item) => readToggle(settings, item)).length;
  if (on === total) return 'All on';
  if (on === 0) return 'All off';
  return `${on} of ${total} on`;
}

export const NOTIFICATION_SECTION_ROUTE = '/settings/notifications';
export function notificationSectionHref(id: NotificationSectionId) {
  return `${NOTIFICATION_SECTION_ROUTE}/${id}` as const;
}

/** Dependent controls keep their values while their parent preference is off. */
export function visibleNotificationToggles(section: NotificationSectionConfig, settings: NotificationSettings) {
  return section.items.filter(item =>
    !(item.section === 'comments' && item.key !== 'enabled' && !settings.comments.enabled) &&
    !(item.section === 'tags' && item.key !== 'mentions' && !settings.tags.mentions));
}
