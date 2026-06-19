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
const bottomSheet = read('components/ui/AppBottomSheet.tsx');
const selectSheet = read('components/ui/AppSelectSheet.tsx');

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
  'app/settings/upload-preferences.tsx',
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
  '/settings/upload-preferences',
  '/settings/support',
  '/settings/location',
].forEach((route) => {
  assert.match(settingsIndex, new RegExp(route.replace(/[/-]/g, (match) => `\\${match}`)), `${route} must be linked from Settings`);
});

assert.ok(!exists('app/settings/storage.tsx'), 'user-facing cache controls must be removed');
assert.doesNotMatch(settingsIndex, /FontAwesome|Media cache|settings\/storage/, 'Settings must use emoji markers and expose no cache controls');
assert.match(settingsIndex, /emoji:\s*'👤'/, 'Settings must use the shared colored emoji vocabulary');
assert.doesNotMatch(
  profileApi,
  /isEmailVerified:\s*Boolean\(s\.isEmailVerified\)/,
  'profile normalization must not manufacture an unverified state when the endpoint omits it',
);
assert.match(profile, /useUnreadNotificationCount\(\)/, 'shopper profile must render the shared unread notification count');
assert.match(profile, /refreshUnreadNotificationCount/, 'shopper profile must refresh unread notifications from the backend');
assert.match(bottomSheet, /onPressIn=\{\(\) => \{[\s\S]*Keyboard\.dismiss\(\);[\s\S]*onClose\(\);/, 'sheet backdrop touch must close even with the keyboard open');
assert.match(bottomSheet, /onPanResponderMove/, 'selector sheets must support interactive swipe-down dismissal');
assert.match(selectSheet, /onDismiss=\{\(\) => \{/, 'selector values must commit after the close animation');
assert.doesNotMatch(selectSheet, /requestAnimationFrame\(\(\) => onChange/, 'selector values must not relayout the form during close');

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
