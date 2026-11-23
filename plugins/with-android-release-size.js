const fs = require('fs');
const path = require('path');
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

/**
 * Smaller Android release builds (the preview APK measured 125 MB).
 *
 * Where that 125 MB went (unzip -lv of apk-a7e35f6):
 *   50.4 MB  lib/x86 + lib/x86_64   emulator-only native code no phone runs
 *   40.1 MB  lib/arm64 + armeabi    stored uncompressed
 *   18.4 MB  classes*.dex           Java/Kotlin, never minified
 *    9.6 MB  index.android.bundle   Hermes bytecode
 *
 * - ARM only. `reactNativeArchitectures` becomes `ndk.abiFilters` (React
 *   Native Gradle plugin), which filters every library's .so, prebuilt ones
 *   included. armeabi-v7a stays for 32-bit Android Go phones.
 *   `WIEZ_ANDROID_ARCHS` overrides it, e.g. for an x86_64 emulator build.
 * - R8 minification and resource shrinking in release.
 * - Compressed native libraries. Uncompressed .so files only pay off on Play,
 *   which serves per-device splits; a sideloaded universal APK is downloaded
 *   whole, so compression is what makes it smaller to fetch.
 *
 * Applies to release builds only; debug and dev-client builds are untouched.
 */
const RELEASE_SIZE_PROPERTIES = {
  reactNativeArchitectures: process.env.WIEZ_ANDROID_ARCHS || 'armeabi-v7a,arm64-v8a',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'android.enablePngCrunchInReleaseBuilds': 'true',
  'expo.useLegacyPackaging': 'true',
};

/**
 * Keep rules for code reached only by reflection, which R8 cannot see.
 * Expo modules, React Native, Reanimated and Sentry ship their own; these are
 * the ones that do not.
 */
const KEEP_RULES_MARKER = '# @generated wiez-release-size keep rules';
const KEEP_RULES = `
${KEEP_RULES_MARKER}
# Credential Manager loads its Play Services provider by reflection (passkeys).
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
`;

function withReleaseSizeProperties(config) {
  return withGradleProperties(config, (gradle) => {
    for (const [key, value] of Object.entries(RELEASE_SIZE_PROPERTIES)) {
      const existing = gradle.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      );
      if (existing) existing.value = value;
      else gradle.modResults.push({ type: 'property', key, value });
    }
    return gradle;
  });
}

function withReleaseKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const file = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(KEEP_RULES_MARKER)) {
        fs.writeFileSync(file, `${current.trimEnd()}\n${KEEP_RULES}`);
      }
      return modConfig;
    },
  ]);
}

module.exports = function withAndroidReleaseSize(config) {
  return withReleaseKeepRules(withReleaseSizeProperties(config));
};
