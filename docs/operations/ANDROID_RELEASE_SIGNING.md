# Android APK release signing

WIEZ already has an Android keystore managed by EAS for `com.wiez.wiez`. Reuse that key; do not generate a new one to repair the GitHub build. EAS access is separate from the keystore's passwords and private key.

## GitHub configuration

The APK workflow uses four repository secrets:

- `ANDROID_KEYSTORE_BASE64`: the existing EAS keystore encoded as base64.
- `ANDROID_KEYSTORE_PASSWORD`: its store password.
- `ANDROID_KEY_ALIAS`: the existing private-key alias.
- `ANDROID_KEY_PASSWORD`: that key's password.

The repository variable `ANDROID_SIGNING_CERT_SHA256` pins the expected public signing certificate. This is a SHA-256 digest, not an APK file checksum. The public React Native template debug certificate is refused. An account-wide Expo token is not required by this workflow.

Only the signing step receives signing secrets. Passwords reach Android's `apksigner` through environment-variable references, never command-line password literals. Temporary keystores are created in the runner's temporary directory with restrictive permissions and cleaned up after the step.

## Build and verification

The generated project is built normally, preserving Expo prebuild and the existing Gradle setup. Before publishing, `scripts/sign-android-apk.cjs` signs a separate temporary APK with the existing release key, runs Android SDK `apksigner verify`, and checks that its sole certificate matches the pin. Only then does it copy the verified APK into `dist` for artifact/release publication. Missing credentials, signing failure, an unexpected signer or an existing output file fail the job. The input APK is preserved.

No package contents may change after signing. The workflow's stable download alias copies the already-verified APK bytes. Do not publish the intermediate Gradle APK directly.

Local controlled-outcome tests run with `npm run test:android-release-signing`. They cover missing/invalid credentials, public debug trust, a wrong signer, cryptographic-verification failure, cleanup, password argument handling and preservation of existing files. These tests do not substitute for a real CI APK build and certificate verification.

On 2 November 2026, the existing EAS store password and private key were verified locally, the matching certificate was checked, and the four GitHub secrets plus certificate variable were configured. The workflow update remains part of the unreleased security change. A successful build from the integrated revision is still required before declaring signing live.

## Installed devices and passkeys

Before updating a phone, compare its installed signing certificate with the release pin. Android rejects an ordinary update across different signing keys. Never uninstall the user's app or clear drafts/preferences to hide this mismatch; record it and arrange the migration explicitly.

Android passkeys also require the exact installed certificate in the backend's allowed Android origins and the website's Digital Asset Links file. App Links alone do not enable passkeys: `delegate_permission/common.get_login_creds` is required. Google Play app signing may use a different certificate from the upload/EAS key; verify the actual distribution channel.

Native Apple passkeys are deferred. Keep authenticator/recovery alternatives on iOS.

References: [Expo credential synchronization](https://docs.expo.dev/app-signing/syncing-credentials/), [Android APK signing and verification](https://developer.android.com/tools/apksigner), [Android Credential Manager prerequisites](https://developer.android.com/identity/credential-manager/prerequisites).
