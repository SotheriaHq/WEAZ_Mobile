/**
 * Mobile Theme Audit Script - Phase 12 Guardrails
 *
 * Scans: app/**, components/**, src/**
 * Purpose: Prevent native theme regressions across the mobile codebase.
 *
 * ALLOWLIST CATEGORIES:
 * 1. THEME_UNIONS_ALLOWLIST   - canonical type definition file only
 * 2. APPEARANCE_API_ALLOWLIST - ThemeProvider only (system-level API gating)
 * 3. BINARY_TOGGLE_ALLOWLIST  - intentional StatusBar/resolved-theme reads only
 * 4. COLOR_ALLOWLIST          - pre-audited files with intentional colors:
 *    - tokens.ts (definitions)
 *    - ToastContext (alert semantics)
 *    - Studio webview (resolved scheme bridge)
 *    - Auth screens (brand gradient and visual identity)
 *    - CollectionCard and media viewer files (intentional media overlays)
 *    - ProfileMenuDropup (intentional glass surface)
 *    - orders/[orderId] (intentional status badge colors)
 *    - create-collection (brand CTA color, not a theme surface)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ALLOWED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

const THEME_UNIONS_ALLOWLIST = [
  path.join('src', 'types', 'theme.ts'),
];

const APPEARANCE_API_ALLOWLIST = [
  path.join('src', 'theme', 'ThemeProvider.tsx'),
  path.join('src', 'system', 'AndroidSystemBars.ts'), // Protected app-shell bridge for native system bar color scheme.
];

// Files allowed to have binary scheme ternaries when they do not mutate
// preference state and are limited to rendering/runtime contrast decisions.
const BINARY_TOGGLE_ALLOWLIST = [
  path.join('app', '(tabs)', 'index.tsx'),   // StatusBar contrast only
  path.join('app', '(tabs)', 'store.tsx'),   // StatusBar contrast only
  path.join('app', 'profile', '[id].tsx'),   // StatusBar contrast only
  path.join('app', 'studio', 'webview.tsx'), // Intentional resolved scheme bridge
  path.join('src', 'features', 'feed', 'components', 'MarketFeedScreen.tsx'), // StatusBar/BlurView contrast only
  path.join('src', 'features', 'market', 'components', 'MarketScreen.tsx'),   // StatusBar contrast only
  path.join('src', 'system', 'AndroidSystemBars.ts'),                         // Protected native system bar bridge
];

// Files allowed to have hardcoded surface/text/border colors.
// Each entry documents why it is allowed.
const COLOR_ALLOWLIST = [
  path.join('src', 'styles', 'tokens.ts'),                         // Token definitions - source of truth
  path.join('src', 'toast', 'ToastContext.tsx'),                   // Alert semantic colors
  path.join('app', 'studio', 'webview.tsx'),                       // Studio resolved-scheme bridge
  path.join('app', 'catalog', 'index.tsx'),                        // StatusBar style string, not a theme surface
  path.join('app', 'catalog', 'create-collection.tsx'),            // Brand CTA color
  path.join('app', 'orders', '[orderId].tsx'),                     // Order status badge colors
  path.join('app', '(auth)'),                                      // Brand identity/auth visuals
  path.join('components', 'catalog', 'CollectionCard.tsx'),        // Image fallback gradient overlay
  path.join('components', 'catalog', 'CollectionCommentsSheet.tsx'), // Media overlay on dark backdrop
  path.join('components', 'catalog', 'CollectionDetailViewer.tsx'),  // Full-screen media overlay
  path.join('components', 'catalog', 'EditBrandProfileSheet.tsx'),   // Avatar placeholder fill
  path.join('components', 'catalog', 'ProfileHeader.tsx'),           // Media/banner overlay
  path.join('components', 'catalog', 'ThreadRailAction.tsx'),        // Video overlay contrast
  path.join('components', 'catalog', 'ThreadTapBurstOverlay.tsx'),   // Animation overlay
  path.join('components', 'navigation', 'ProfileMenuDropup.tsx'),    // Intentional glass surface rgba
  path.join('components', 'profile', 'ProfileImageModal.tsx'),       // Full-screen media backdrop
  path.join('components', 'ui', 'Chip.tsx'),                         // 'transparent' keyword, not a theme color
  path.join('src', 'features', 'feed', 'components', 'MarketFeedScreen.tsx'), // Full-screen media overlay/shadow contrast
];

const RESOLVED_THEME_LEAKAGE_ALLOWLIST = [
  path.join('src', 'theme', 'ThemeProvider.tsx'),
  path.join('app', 'studio', 'webview.tsx'), // Intentionally passes resolved scheme to WebView
];

const RULES = [
  {
    name: 'UNSUPPORTED_THEME_MODES',
    description: 'Blocks active use of legacy auto/time theme modes in code logic.',
    regex: /themePreference\s*:\s*['"](auto|time)['"]|setThemePreference\(\s*['"](auto|time)['"]\s*\)|setMode\(\s*['"](auto|time)['"]\s*\)|default(?:Mode|Preference)\s*=\s*['"](auto|time)['"]/i,
    errorMessage: 'Unsupported theme mode (auto|time) detected. Only light|dark|system are supported.',
  },
  {
    name: 'DUPLICATE_THEME_UNION',
    description: 'New code must import ThemePreference from src/types/theme.ts, not redefine the union.',
    regex: /['"]light['"]\s*\|\s*['"]dark['"]\s*\|\s*['"]system['"]/g,
    errorMessage: "Duplicate theme union 'light' | 'dark' | 'system'. Import ThemePreference from src/types/theme.ts.",
    allowlist: THEME_UNIONS_ALLOWLIST,
  },
  {
    name: 'BACKEND_LEAKAGE',
    description: 'resolvedTheme must remain client-only; only themePreference is synced to the backend.',
    regex: /themePreference\s*:\s*resolvedTheme|preferences.*resolvedTheme|SecureStore\.setItem.*resolvedTheme/g,
    errorMessage: 'resolvedTheme is leaking into backend/storage. Only ThemePreference should be persisted or synced.',
    allowlist: RESOLVED_THEME_LEAKAGE_ALLOWLIST,
  },
  {
    name: 'INDEPENDENT_SYSTEM_THEME_API',
    description: 'Appearance and useColorScheme must be used only inside ThemeProvider to keep system-theme state centralized.',
    regex: /Appearance\.getColorScheme\(\)|Appearance\.addChangeListener\(\)|useColorScheme\(\)/g,
    errorMessage: 'Direct Appearance/useColorScheme call outside ThemeProvider. Use useTheme() instead.',
    allowlist: APPEARANCE_API_ALLOWLIST,
  },
  {
    name: 'BINARY_TOGGLE_OVERWRITE',
    description: 'Binary scheme toggles destroy the system option. Theme changes must go through setThemePreference with 3-state logic.',
    regex: /(?:theme|resolvedTheme|scheme)\s*===\s*['"]dark['"]\s*\?\s*['"]light['"]\s*:\s*['"]dark['"]|setThemePreference\(\s*(?:theme|resolvedTheme|scheme)\s*===\s*['"]dark['"]/g,
    errorMessage: 'Binary light/dark toggle detected. Use setThemePreference with an explicit 3-state value.',
    allowlist: BINARY_TOGGLE_ALLOWLIST,
  },
  {
    name: 'RISKY_HARDCODED_COLORS',
    description: 'Surface, text, and border colors must come from theme tokens to support light/dark switching.',
    regex: /(?:backgroundColor|color|borderColor)\s*:\s*['"](?:#fff(?:fff)?|#000(?:000)?|#111827|#0f172a|#f8fafc|white|black|rgba\(255,\s*255,\s*255|rgba\(0,\s*0,\s*0)[^'"]*['"]/gi,
    errorMessage: 'Hardcoded surface/text/border color. Use theme.colors.* semantic tokens instead.',
    allowlist: COLOR_ALLOWLIST,
  },
];

let errorsFound = 0;

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const entry of list) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (ALLOWED_EXTENSIONS.includes(path.extname(full))) {
      results.push(full);
    }
  }
  return results;
}

function isAllowed(relativePath, allowlist) {
  return allowlist.some((allowed) => relativePath.includes(allowed));
}

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(ROOT_DIR, filePath);

  for (const rule of RULES) {
    if (rule.allowlist && isAllowed(relativePath, rule.allowlist)) continue;

    if (rule.regex.test(content)) {
      rule.regex.lastIndex = 0;
      console.error(`\x1b[31m[FAIL]\x1b[0m ${rule.name}  \x1b[2m${relativePath}\x1b[0m`);
      console.error(`       \x1b[33m->\x1b[0m ${rule.errorMessage}`);
      errorsFound++;
    }
    rule.regex.lastIndex = 0;
  }
}

function auditStaleScripts() {
  const staleNames = ['migrate.js', 'migrate2.js', 'migrate-theme.js'];
  const searchRoots = [ROOT_DIR, path.resolve(ROOT_DIR, '..')];
  for (const root of searchRoots) {
    for (const name of staleNames) {
      if (fs.existsSync(path.join(root, name))) {
        console.error(`\x1b[31m[FAIL]\x1b[0m STALE_MIGRATION_SCRIPT  \x1b[2m${path.join(root, name)}\x1b[0m`);
        console.error('       \x1b[33m->\x1b[0m One-off migration script should not be committed. Remove it.');
        errorsFound++;
      }
    }
  }
}

function runAudit() {
  console.log('\x1b[1mMobile Theme Audit - Phase 12 Guardrails\x1b[0m\n');

  const targets = ['app', 'components', 'src'];
  for (const target of targets) {
    const dir = path.join(ROOT_DIR, target);
    if (fs.existsSync(dir)) {
      walk(dir).forEach(auditFile);
    }
  }

  auditStaleScripts();

  console.log('');
  if (errorsFound > 0) {
    console.error(`\x1b[31mAudit failed - ${errorsFound} violation${errorsFound === 1 ? '' : 's'} found.\x1b[0m`);
    console.error('  Fix violations above or add an explicit allowlist entry with a documented reason.');
    process.exit(1);
  } else {
    console.log('\x1b[32mAudit passed - no theme regressions detected.\x1b[0m');
  }
}

runAudit();
