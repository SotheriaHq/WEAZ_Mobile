const appJson = require('./app.json');

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

module.exports = () => {
  const baseConfig = appJson.expo;
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
    extra,
  };
};
