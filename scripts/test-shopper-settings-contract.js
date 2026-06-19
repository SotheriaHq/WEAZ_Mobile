const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const settingsIndex = read('app/settings.tsx');
const profile = read('app/(tabs)/me.tsx');
const verifyEmail = read('app/(auth)/verify-email.tsx');
const authContext = read('src/auth/AuthContext.tsx');
const authApi = read('src/api/AuthApi.ts');
const notificationsApi = read('src/api/NotificationsApi.ts');
const profileApi = read('src/api/ProfileApi.ts');

assert.doesNotMatch(
  profile,
  /More settings are coming soon/,
  'profile settings action must not show the old placeholder toast',
);
assert.match(
  profile,
  /router\.push\('\/settings' as any\)/,
  'profile settings action must route to the Settings screen',
);

assert.match(
  verifyEmail,
  /updateUser\(\{ isEmailVerified: true \}\)/,
  'email verification success must update local auth state immediately',
);
assert.match(
  verifyEmail,
  /validateToken\(\{ forceRefresh: true \}\)/,
  'email verification success must bypass stale auth profile cache',
);
assert.match(
  authContext,
  /staleTime:\s*forceRefresh \? 0 : THREADLY_QUERY_STALE_TIME_MS/,
  'AuthContext validateToken must support force-refreshing the backend profile',
);

assert.doesNotMatch(
  settingsIndex,
  /comingSoon\(|will open when that settings screen is ready|coming soon/i,
  'Settings index must not wire shopper rows to coming-soon placeholders',
);

[
  'app/settings/account-security.tsx',
  'app/settings/email-preferences.tsx',
  'app/settings/privacy.tsx',
  'app/settings/sizing.tsx',
  'app/settings/payment.tsx',
  'app/settings/storage.tsx',
  'app/settings/support.tsx',
  'app/settings/location.tsx',
  'app/settings/notifications.tsx',
  'app/settings/market-preferences.tsx',
  'app/settings/theme.tsx',
  'app/settings/delete-account.tsx',
].forEach((file) => {
  assert.ok(exists(file), `${file} must exist as a concrete shopper settings route`);
});

[
  '/settings/account-security',
  '/settings/email-preferences',
  '/settings/privacy',
  '/settings/sizing',
  '/settings/payment',
  '/settings/storage',
  '/settings/support',
  '/settings/location',
].forEach((route) => {
  assert.match(settingsIndex, new RegExp(route.replace(/[/-]/g, (match) => `\\${match}`)), `${route} must be linked from Settings`);
});

[
  'changePassword',
  'requestEmailChange',
  'listSecuritySessions',
  'revokeSecuritySession',
  'logoutOtherSecuritySessions',
].forEach((method) => {
  assert.match(authApi, new RegExp(`export async function ${method}\\(`), `AuthApi must expose ${method}`);
});

[
  'getEmailSettings',
  'updateEmailSettings',
  'resetEmailSettings',
].forEach((method) => {
  assert.match(notificationsApi, new RegExp(`async ${method}\\(`), `NotificationsApi must expose ${method}`);
});

assert.match(
  profileApi,
  /updateProfileVisibility\(profileVisibility:/,
  'ProfileApi must expose backend profile visibility updates',
);
assert.match(
  profileApi,
  /updateSizeFitSettings\(payload:/,
  'ProfileApi must expose backend size-fit settings updates',
);

console.log('shopper settings contract passed');
