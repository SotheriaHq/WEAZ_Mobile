export type NotificationSettings = {
  security: {
    login: boolean;
    logout: boolean;
  };
  push: {
    enabled: boolean;
    sound: boolean;
    vibration: boolean;
    showPreview: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  };
  social: {
    threads: boolean;
    follows: boolean;
    patches: boolean;
  };
  comments: {
    enabled: boolean;
    replies: boolean;
    fromUnpatchedUsers: boolean;
  };
  tags: {
    mentions: boolean;
    fromUnpatchedUsers: boolean;
  };
  collections: {
    lifecycle: boolean;
    access: boolean;
  };
  brand: {
    patchRequests: boolean;
    contributions: boolean;
    verificationPrompts: boolean;
  };
  orders: {
    placed: boolean;
    statusChanges: boolean;
  };
  reviews: {
    reminders: boolean;
    replies: boolean;
    moderation: boolean;
  };
  fit: {
    reminders: boolean;
    shares: boolean;
    approvals: boolean;
  };
  messaging: {
    newMessages: boolean;
    reminders: boolean;
    moderation: boolean;
    desktop: boolean;
    sound: boolean;
    readReceipts: boolean;
    deliveryReceipts: boolean;
  };
};

export type NotificationSettingsPatch = {
  [K in keyof NotificationSettings]?: Partial<NotificationSettings[K]>;
};

export type NotificationSettingsSection = keyof NotificationSettings;
export type NotificationSettingsPatchValue = boolean | string | null;

export type NotificationSettingPatchDescriptor = {
  section: NotificationSettingsSection;
  key: string;
  value: NotificationSettingsPatchValue;
};

const QUIET_HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidQuietHour(value: string): boolean {
  return QUIET_HOUR_PATTERN.test(value.trim());
}

export function normalizeQuietHourInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildNotificationSettingsPatch(
  section: NotificationSettingsSection,
  key: string,
  value: NotificationSettingsPatchValue,
): NotificationSettingsPatch {
  return {
    [section]: {
      [key]: value,
    },
  } as NotificationSettingsPatch;
}

export function applyNotificationSettingsPatch(
  settings: NotificationSettings,
  patch: NotificationSettingPatchDescriptor,
): NotificationSettings {
  const currentSection = settings[patch.section] as Record<string, unknown>;

  return {
    ...settings,
    [patch.section]: {
      ...currentSection,
      [patch.key]: patch.value,
    },
  } as NotificationSettings;
}
