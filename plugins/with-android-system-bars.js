const {
  AndroidConfig,
  withAndroidColors,
  withAndroidStyles,
  withMainActivity,
} = require('expo/config-plugins');

const TRANSPARENT_COLOR = '#00000000';
const TRANSPARENT_NAV_COLOR_NAME = 'threadly_navigation_bar_transparent';
const EXPO_NAV_COLOR_NAME = 'navigationBarColor';
const APP_THEME_NAME = 'AppTheme';
const GENERATED_START = '// @generated begin threadly-system-bars';
const GENERATED_END = '// @generated end threadly-system-bars';

const KOTLIN_SYSTEM_BAR_IMPORTS = [
  'import android.graphics.Color',
  'import android.os.Build',
  'import androidx.core.view.WindowCompat',
];

const JAVA_SYSTEM_BAR_IMPORTS = [
  'import android.graphics.Color;',
  'import android.os.Build;',
  'import androidx.core.view.WindowCompat;',
];

const KOTLIN_SYSTEM_BAR_BLOCK = `    ${GENERATED_START}
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.decorView.fitsSystemWindows = false
    window.navigationBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.navigationBarDividerColor = Color.TRANSPARENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    ${GENERATED_END}`;

const JAVA_SYSTEM_BAR_BLOCK = `    ${GENERATED_START}
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().getDecorView().setFitsSystemWindows(false);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      getWindow().setNavigationBarDividerColor(Color.TRANSPARENT);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getWindow().setNavigationBarContrastEnforced(false);
    }
    ${GENERATED_END}`;

function setColor(colors, name, value) {
  return AndroidConfig.Colors.setColorItem(
    AndroidConfig.Resources.buildResourceItem({
      name,
      value,
    }),
    colors,
  );
}

function setThemeItem(theme, name, value) {
  const item = theme.item ?? [];
  const existingIndex = item.findIndex((entry) => entry?.$?.name === name);
  const nextItem = {
    _: value,
    $: { name },
  };

  if (existingIndex >= 0) {
    item[existingIndex] = nextItem;
  } else {
    item.unshift(nextItem);
  }

  theme.item = item;
}

function ensureAppTheme(styles) {
  const style = styles.resources.style ?? [];
  const existingTheme = style.find((entry) => entry?.$?.name === APP_THEME_NAME);
  if (existingTheme) return existingTheme;

  const nextTheme = {
    $: { name: APP_THEME_NAME },
    item: [],
  };

  style.unshift(nextTheme);
  styles.resources.style = style;
  return nextTheme;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeGeneratedBlock(contents) {
  const blockPattern = new RegExp(
    `\\n?\\s*${escapeRegExp(GENERATED_START)}[\\s\\S]*?${escapeRegExp(GENERATED_END)}\\n?`,
    'g',
  );
  return contents.replace(blockPattern, '\n');
}

function addImport(contents, importLine) {
  if (contents.includes(importLine)) return contents;

  const packageMatch = contents.match(/^package\s+.+\r?\n/);
  if (!packageMatch) return `${importLine}\n${contents}`;

  return contents.replace(packageMatch[0], `${packageMatch[0]}\n${importLine}\n`);
}

function injectAfterOnCreateSuper(contents, block, hasSemicolon) {
  const nextContents = removeGeneratedBlock(contents);
  const anchorPattern = hasSemicolon
    ? /super\.onCreate\((?:null|savedInstanceState)\);\s*/
    : /super\.onCreate\((?:null|savedInstanceState)\)\s*/;

  if (!anchorPattern.test(nextContents)) {
    throw new Error('Unable to apply Threadly Android system-bars policy: MainActivity onCreate anchor not found.');
  }

  return nextContents.replace(anchorPattern, (match) => `${match}\n${block}\n`);
}

function applyMainActivitySystemBars(mainActivity) {
  const { language } = mainActivity.modResults;
  let { contents } = mainActivity.modResults;

  if (language === 'kt') {
    contents = KOTLIN_SYSTEM_BAR_IMPORTS.reduce(addImport, contents);
    mainActivity.modResults.contents = injectAfterOnCreateSuper(
      contents,
      KOTLIN_SYSTEM_BAR_BLOCK,
      false,
    );
    return mainActivity;
  }

  if (language === 'java') {
    contents = JAVA_SYSTEM_BAR_IMPORTS.reduce(addImport, contents);
    mainActivity.modResults.contents = injectAfterOnCreateSuper(
      contents,
      JAVA_SYSTEM_BAR_BLOCK,
      true,
    );
    return mainActivity;
  }

  throw new Error(`Unable to apply Threadly Android system-bars policy to ${language} MainActivity.`);
}

module.exports = function withThreadlyAndroidSystemBars(config) {
  config = withAndroidColors(config, (nextConfig) => {
    nextConfig.modResults = setColor(
      nextConfig.modResults,
      TRANSPARENT_NAV_COLOR_NAME,
      TRANSPARENT_COLOR,
    );
    nextConfig.modResults = setColor(nextConfig.modResults, EXPO_NAV_COLOR_NAME, TRANSPARENT_COLOR);
    return nextConfig;
  });

  config = withAndroidStyles(config, (nextConfig) => {
    const theme = ensureAppTheme(nextConfig.modResults);

    setThemeItem(theme, 'android:navigationBarColor', `@color/${TRANSPARENT_NAV_COLOR_NAME}`);
    setThemeItem(theme, 'android:navigationBarDividerColor', `@color/${TRANSPARENT_NAV_COLOR_NAME}`);
    setThemeItem(theme, 'android:enforceNavigationBarContrast', 'false');
    setThemeItem(theme, 'android:windowDrawsSystemBarBackgrounds', 'true');

    nextConfig.modResults.resources.style = nextConfig.modResults.resources.style ?? [];
    return nextConfig;
  });

  config = withMainActivity(config, applyMainActivitySystemBars);

  return config;
};
