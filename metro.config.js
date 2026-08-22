// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Node core module shims for dependencies that were written for Node.
 *
 * React Native ships no Node standard library, so a bare `require('punycode')`
 * that Node would satisfy from its builtins is simply unresolvable here and
 * Metro fails the whole bundle — not the one screen that pulled it in. That is
 * what took Android down: `app/legal/[slug].tsx` renders policy documents with
 * `react-native-markdown-display`, which depends on `markdown-it`, which
 * requires `punycode` to fold international domains while autolinking.
 *
 * `punycode` also exists as an ordinary npm package: pure JS, no native code,
 * the same implementation Node vendored. Pointing the specifier at it makes the
 * import resolve exactly as `markdown-it` expects.
 *
 * The trailing slash in `require.resolve('punycode/')` is load-bearing. Without
 * it Node resolves its own builtin and hands back the string "punycode"
 * instead of a path.
 */
const NODE_MODULE_SHIMS = {
  punycode: require.resolve('punycode/'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = NODE_MODULE_SHIMS[moduleName];
  if (shim) {
    return { type: 'sourceFile', filePath: shim };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
