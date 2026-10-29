const appJson = require('./app.json');
const appLinkPaths = require('./src/navigation/appLinkPaths.json');

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
      intentFilters: withAppLinkIntentFilters(baseConfig.android?.intentFilters),
    },

    plugins: withSentryPluginConfig(baseConfig.plugins),

    extra,
  };
};

/**
 * Android App Links for the web app's host: an emailed `https://<web host>/…`
 * link opens this app when it is installed and the browser when it is not.
 * `src/navigation/webLinkRouting.ts` maps each claimed path to a screen.
 *
 * Hosts come from `APP_LINK_HOSTS` (comma-separated) or else the host of
 * `EXPO_PUBLIC_WEB_APP_URL` when it is https. Without one, nothing is claimed,
 * so local builds behave exactly as before.
 *
 * Android only opens the app once the host serves
 * `/.well-known/assetlinks.json` naming this package and the SHA-256 of the
 * key that signed the installed APK. Until then the link opens in the browser,
 * which is the behaviour these links had before.
 */
function resolveAppLinkHosts() {
  const configured = readString(process.env.APP_LINK_HOSTS);
  if (configured) {
    return configured
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }
  const webAppUrl = readString(process.env.EXPO_PUBLIC_WEB_APP_URL);
  if (!webAppUrl) return [];
  try {
    const url = new URL(webAppUrl);
    return url.protocol === 'https:' ? [url.hostname.toLowerCase()] : [];
  } catch {
    return [];
  }
}

function withAppLinkIntentFilters(intentFilters) {
  const hosts = resolveAppLinkHosts();
  if (hosts.length === 0) return intentFilters;
  return [
    ...(Array.isArray(intentFilters) ? intentFilters : []),
    {
      action: 'VIEW',
      autoVerify: true,
      data: hosts.flatMap((host) =>
        appLinkPaths.pathPrefixes.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
      ),
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ];
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
