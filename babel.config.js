module.exports = function (api) {
  const isProduction = api.env((envName) => envName === 'production');
  const plugins = [];

  if (isProduction) {
    try {
      require.resolve('babel-plugin-transform-remove-console');
      plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
    } catch {
      // plugin not installed; install with: npm i -D babel-plugin-transform-remove-console
    }
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
