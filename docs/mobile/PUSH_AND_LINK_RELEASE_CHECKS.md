# Push registration and email-link release checks

## Account safety

Push-token writes, local registration records and logout cleanup use one ordered
queue. Signing out invalidates the outgoing attempt immediately. Cleanup uses
the outgoing account's captured credentials and cannot cancel the incoming
account's registration or replace its device status.

A successful server registration is retained in memory even if SecureStore is
unavailable, so logout still knows which token to deactivate. Persistent records
are cleanup hints, not proof of an active server subscription. Each new session
registers again; repeated attempts within the same session use a bounded-age
success cache. A failed local deletion cannot suppress re-registration.

## Browser and native ownership

Android claims custom-order lists, UUID order details and UUID extension-request
links. It uses exact paths and fixed-length `pathPattern` simple globs, supported
before Android API 31. `/custom-orders/new` and `/custom-orders/resume/<token>`
remain browser checkout flows. Claiming their parent prefix would intercept them
and discard the recovery token. Native routing and Expo intent filters share
`src/navigation/appLinkPaths.json`.

Other supported email-link families retain their native routing. Email
verification and password reset remain owned by the existing auth-link gate.

## Verification

Automated contracts exercise delayed logout, account switches, rejected cleanup,
stale results, secure-storage write/delete failures, retry and permission states,
and the manifest/routing agreement including browser-only checkout paths.

Before marking device delivery complete:

1. Build the APK with `google-services.json` for `com.wiez.wiez`. The FCM V1
   service-account private key belongs in the Expo project's Android credentials,
   never in this repository.
2. Install the resulting APK, enable Android notification permission and sign in.
   In notification settings, verify the phone is ready and saved with WIEZ.
3. Deliver a test notification. Sign out, switch accounts and verify only the
   current account receives its own notifications. Repeat on app resume.
4. Verify App Links only after the site's `assetlinks.json` includes the actual
   APK signing certificate SHA-256. Browser checkout recovery must remain in the
   browser. Verification/reset links must work on cold and warm app launches.

Code tests do not establish Firebase credential validity, domain association or
delivery on a physical device.
