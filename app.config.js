const fs = require('node:fs');
const path = require('node:path');
const appJson = require('./app.json');

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

module.exports = ({ config } = {}) => {
  const baseConfig = {
    ...(config ?? {}),
    ...appJson.expo,
  };
  const easProjectId = readString(process.env.EXPO_PUBLIC_EAS_PROJECT_ID);
  const extra = {
    ...(baseConfig.extra ?? {}),
  };

  if (easProjectId) {
    extra.eas = {
      ...(extra.eas ?? {}),
      projectId: easProjectId,
    };
  }

  return {
    ...baseConfig,

      android: {
      ...(baseConfig.android ?? {}),
      package: readString(process.env.EXPO_PUBLIC_ANDROID_PACKAGE) ?? 'com.wiez.wiez',
      ...withGoogleServicesFile(baseConfig.android?.googleServicesFile),
    },

    plugins: withSentryPluginConfig(baseConfig.plugins),

    extra,
  };
};

/**
 * Firebase config for Android push.
 *
 * WIEZ sends pushes through Expo, and Expo delivers to Android phones through
 * Firebase Cloud Messaging; there is no other channel to an Android phone.
 * Without google-services.json compiled in, the phone cannot produce a push
 * token at all, which is what "device could not register" was. The file is not
 * a secret (Expo says it may be committed). The FCM service-account key that
 * lets Expo send is a secret and belongs in EAS credentials, never here.
 *
 * Taken from `GOOGLE_SERVICES_JSON` (a path; EAS file variables provide one),
 * else `./google-services.json` when present. Neither: unchanged, no push.
 */
function withGoogleServicesFile(configured) {
  const fromEnv = readString(process.env.GOOGLE_SERVICES_JSON);
  if (fromEnv) return { googleServicesFile: fromEnv };
  if (configured) return { googleServicesFile: configured };
  const local = path.join(__dirname, 'google-services.json');
  return fs.existsSync(local) ? { googleServicesFile: './google-services.json' } : {};
}

/**
 * `app.json` registers the Sentry plugin as a bare string, which is why every
 * `expo start` prints "Missing config for organization, project". The plugin
 * needs those to upload source maps at BUILD time — without them a crash
 * report arrives as minified bundle offsets instead of file and line.
 *
 * The values are account-specific, so they come from the environment rather
 * than being hard-coded: set `SENTRY_ORG` and `SENTRY_PROJECT` (and
 * `SENTRY_URL` only for self-hosted). When they are absent the plugin is left
 * exactly as it was, so the warning still appears — which is correct. It is
 * telling the truth, and silencing it with placeholder values would only hide
 * that source maps are not being uploaded.
 *
 * Separately: crash reporting is off at RUNTIME until `EXPO_PUBLIC_SENTRY_DSN`
 * is set. `initMobileSentry()` returns early without one.
 */
function withSentryPluginConfig(plugins) {
  const organization = readString(process.env.SENTRY_ORG);
  const project = readString(process.env.SENTRY_PROJECT);
  if (!Array.isArray(plugins) || !organization || !project) {
    return plugins;
  }

  const url = readString(process.env.SENTRY_URL);
  return plugins.map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== '@sentry/react-native') return plugin;
    return [
      '@sentry/react-native',
      {
        ...(Array.isArray(plugin) ? (plugin[1] ?? {}) : {}),
        organization,
        project,
        ...(url ? { url } : {}),
      },
    ];
  });
}
