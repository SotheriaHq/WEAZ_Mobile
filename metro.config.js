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

/**
 * Defer `require()` to first use instead of evaluating every module at startup.
 *
 * This is the difference between an app that opens and one that does not on a
 * low-RAM phone. Expo SDK 56 ships `inlineRequires: false`, and Expo Router
 * builds its route table with `require.context` over `app/` — so all 70 route
 * files, their entire transitive import graphs, and ~3.4MB of our own source
 * are pulled into the initial bundle AND executed before the first frame.
 * A fast laptop absorbs that; an Infinix or an LG V60 spends minutes on it,
 * which is the reported "bundling reaches 100%, then Reloading… forever" —
 * the bundle had already arrived and the device was still evaluating it.
 *
 * With inlining, a screen's module cost is paid when the user opens that
 * screen, not when the app boots.
 *
 * `nonInlinedRequires` is the safety valve: inlining moves a require to its
 * first *use*, so a module imported purely for its SIDE EFFECT — a polyfill, a
 * runtime that must install itself before anything touches it — would never
 * run at all, or would run too late. Everything below is imported for effect,
 * not for a value. Metro's own defaults are repeated here because supplying
 * this key replaces the default list rather than extending it.
 */
const baseGetTransformOptions = config.transformer.getTransformOptions;

config.transformer.getTransformOptions = async (
  entryPoints,
  options,
  getDependenciesOf,
) => {
  const base = await baseGetTransformOptions(
    entryPoints,
    options,
    getDependenciesOf,
  );

  return {
    ...base,
    transform: {
      ...base.transform,
      inlineRequires: true,
      nonInlinedRequires: [
        // Metro/Expo defaults.
        'React',
        'react',
        'react-compiler-runtime',
        'react/jsx-dev-runtime',
        'react/jsx-runtime',
        'react-native',
        // Must install their runtimes before any component renders.
        'react-native-reanimated',
        'react-native-gesture-handler',
        'react-native-safe-area-context',
        // Registers the root component; inlining it means nothing mounts.
        'expo-router/entry',
        'expo',
      ],
    },
  };
};

module.exports = config;
