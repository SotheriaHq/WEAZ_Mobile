const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const authApi = read('src/api/AuthApi.ts');
const notice = read('components/auth/EmailVerificationNotice.tsx');
const catalog = read('app/catalog/index.tsx');
const profile = read('app/(tabs)/me.tsx');

assert.match(
  authApi,
  /export async function resendVerificationEmail\(\)/,
  'mobile AuthApi must expose verification resend',
);
assert.match(
  authApi,
  /apiClient\.post<VerifyEmailResponse>\('\/auth\/verify-email\/resend'\)/,
  'verification resend must call the backend resend endpoint',
);

assert.match(
  notice,
  /const DISMISS_TTL_MS = 24 \* 60 \* 60 \* 1000;/,
  'notice dismissal TTL must be 24 hours',
);
assert.match(
  notice,
  /AsyncStorage\.setItem\(storageKey, String\(Date\.now\(\)\)\)/,
  'notice dismissal must store a local timestamp only',
);
assert.doesNotMatch(
  notice,
  /emailVerificationCode|verificationToken|token=/,
  'mobile notice must not expose verification tokens or codes',
);

assert.match(
  catalog,
  /<EmailVerificationNotice[\s\S]*context="catalog"[\s\S]*emailVerified=\{userEmailVerified\}/,
  'owner catalog must render the email verification notice from auth state',
);
assert.match(
  profile,
  /<EmailVerificationNotice[\s\S]*context="profile"/,
  'profile tab must render the email verification notice',
);

console.log('email verification notice contract passed');
