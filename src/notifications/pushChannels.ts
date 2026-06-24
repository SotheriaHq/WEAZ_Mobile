import type * as ExpoNotifications from 'expo-notifications';

type ExpoNotificationsModule = typeof ExpoNotifications;

/**
 * Canonical Android notification channel ids.
 *
 * These string ids are the contract between the client (which creates the OS
 * channels) and the backend (`push-notifications.service.ts`, which stamps
 * `channelId` on each Expo push message). They MUST stay in lock-step with the
 * backend `PUSH_CHANNEL_IDS` mapping or Android will silently fall back to the
 * default channel.
 */
export const PUSH_CHANNEL_IDS = {
  default: 'default',
  messages: 'messages',
  orders: 'orders',
  social: 'social',
  commerce: 'commerce',
  system: 'system',
} as const;

export type PushChannelId = (typeof PUSH_CHANNEL_IDS)[keyof typeof PUSH_CHANNEL_IDS];

type ImportanceKey = 'MAX' | 'HIGH' | 'DEFAULT' | 'LOW';

type ChannelDefinition = {
  id: PushChannelId;
  name: string;
  description: string;
  importance: ImportanceKey;
  vibrationPattern: number[];
};

const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: PUSH_CHANNEL_IDS.messages,
    name: 'Messages',
    description: 'Direct messages and order conversations',
    importance: 'MAX',
    vibrationPattern: [0, 250, 250, 250],
  },
  {
    id: PUSH_CHANNEL_IDS.orders,
    name: 'Orders',
    description: 'Order and custom order updates',
    importance: 'HIGH',
    vibrationPattern: [0, 250, 250, 250],
  },
  {
    id: PUSH_CHANNEL_IDS.social,
    name: 'Social',
    description: 'Follows, patches, comments and mentions',
    importance: 'DEFAULT',
    vibrationPattern: [0, 200, 200, 200],
  },
  {
    id: PUSH_CHANNEL_IDS.commerce,
    name: 'Drops & Wishlist',
    description: 'New drops, product availability and featured items',
    importance: 'DEFAULT',
    vibrationPattern: [0, 200, 200, 200],
  },
  {
    id: PUSH_CHANNEL_IDS.system,
    name: 'Account & Security',
    description: 'Account, verification and security notifications',
    importance: 'HIGH',
    vibrationPattern: [0, 250, 250, 250],
  },
  {
    id: PUSH_CHANNEL_IDS.default,
    name: 'General',
    description: 'General notifications',
    importance: 'DEFAULT',
    vibrationPattern: [0, 250, 250, 250],
  },
];

/**
 * Create/refresh every Android notification channel. Safe to call repeatedly —
 * `setNotificationChannelAsync` is idempotent per id. No-op on non-Android.
 */
export async function ensureAndroidPushChannels(
  NotificationsModule: ExpoNotificationsModule,
): Promise<void> {
  const importanceEnum = NotificationsModule.AndroidImportance;

  await Promise.all(
    CHANNEL_DEFINITIONS.map((channel) =>
      NotificationsModule.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: importanceEnum[channel.importance],
        vibrationPattern: channel.vibrationPattern,
      }),
    ),
  );
}
