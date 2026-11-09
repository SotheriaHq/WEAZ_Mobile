/**
 * Phase 1 Android Liquid Glass Component & Integration Tests
 *
 * Verifies:
 * 1. Optical transmission envelopes (light: 0.08-0.20, dark: 0.12-0.28) and token isolation
 * 2. Android API level detection and Mode A (lightweight) / Mode B (enhanced API 31+) gating
 * 3. Multi-layer optical material composition (transmission, optional blur, SVG specular rim,
 *    static reflection, meniscus depth shading, pressed overlay, dynamic layout measurement,
 *    highlight disable, accessibility isolation)
 * 4. Expo BlurView (expo-blur@~56.0.4) Android two-stage mount activation and immutable target sync
 * 5. Catalog banner integration (`BrandProfileHeader`) across light/dark schemes and owner/visitor modes
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

global.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(__dirname, '..');

function parseRgbaAlpha(color) {
  const match = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/.exec(String(color));
  assert.ok(match, `Expected rgba(..., alpha) color string, received: ${color}`);
  return Number(match[1]);
}

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style;
}

function createHarness() {
  let mockPlatform = { OS: 'android', Version: 34 };
  let currentScheme = 'light';
  const moduleCache = new Map();

  const mockQuickPressablePressable = (props) => {
    const [pressed, setPressed] = React.useState(false);
    const resolvedStyle =
      typeof props.style === 'function' ? props.style({ pressed }) : props.style;
    const resolvedChildren =
      typeof props.children === 'function' ? props.children({ pressed }) : props.children;
    return React.createElement(
      'Pressable',
      {
        ...props,
        style: resolvedStyle,
        __setMockPressed: setPressed,
      },
      resolvedChildren,
    );
  };

  const ViewWithRef = React.forwardRef((props, ref) =>
    React.createElement('View', { ...props, ref }, props.children),
  );
  const BlurTargetViewWithRef = React.forwardRef((props, ref) =>
    React.createElement('BlurTargetView', { ...props, ref }, props.children),
  );
  const BlurViewComponent = (props) =>
    React.createElement('BlurView', props, props.children);

  function loadTs(filePath) {
    const resolved = path.resolve(filePath);
    if (moduleCache.has(resolved)) {
      return moduleCache.get(resolved).exports;
    }
    const module = { exports: {} };
    moduleCache.set(resolved, module);

    const source = fs.readFileSync(resolved, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
      fileName: resolved,
    }).outputText;

    const localRequire = (request) => {
      if (request === 'react') return React;
      if (request === 'react-native') {
        return {
          Platform: mockPlatform,
          View: ViewWithRef,
          Pressable: mockQuickPressablePressable,
          StyleSheet: {
            create: (obj) => obj,
            flatten: flattenStyle,
            absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
          },
          useWindowDimensions: () => ({ width: 412, height: 915, scale: 3, fontScale: 1 }),
          Linking: { openURL: async () => true },
        };
      }
      if (request === 'expo-blur') {
        return {
          BlurView: BlurViewComponent,
          BlurTargetView: BlurTargetViewWithRef,
        };
      }
      if (request === 'expo-linear-gradient') {
        return {
          LinearGradient: (props) =>
            React.createElement('ExpoLinearGradient', props, props.children),
        };
      }
      if (request === 'react-native-svg') {
        return {
          __esModule: true,
          default: (props) => React.createElement('Svg', props, props.children),
          Defs: (props) => React.createElement('SvgDefs', props, props.children),
          G: (props) => React.createElement('SvgG', props, props.children),
          LinearGradient: (props) =>
            React.createElement('SvgLinearGradient', props, props.children),
          Rect: (props) => React.createElement('SvgRect', props, props.children),
          Stop: (props) => React.createElement('SvgStop', props, props.children),
        };
      }
      if (request === 'react-native-safe-area-context') {
        return {
          useSafeAreaInsets: () => ({ top: 28, right: 0, bottom: 24, left: 0 }),
        };
      }
      if (request === '@/src/theme/ThemeProvider') {
        const tokensModule = loadTs(path.join(ROOT, 'src', 'styles', 'tokens.ts'));
        return {
          useTheme: () => ({
            scheme: currentScheme,
            theme: tokensModule.tokens.themes[currentScheme],
          }),
        };
      }
      if (request === '@/components/ui/AppText') {
        return {
          AppText: (props) => React.createElement('AppText', props, props.children),
        };
      }
      if (request === '@/components/ui/Button') {
        return {
          Button: (props) => React.createElement('Button', props, props.children),
        };
      }
      if (request === '@/components/ui/Skeleton') {
        return {
          Skeleton: (props) => React.createElement('Skeleton', props),
          SkeletonText: (props) => React.createElement('SkeletonText', props),
        };
      }
      if (request === '@/components/ui/StableImage') {
        return {
          StableImage: (props) => React.createElement('StableImage', props),
        };
      }
      if (request === '@/components/ui/PlatformMark') {
        return {
          ContactMarker: (props) => React.createElement('ContactMarker', props),
        };
      }
      if (request === '@/components/catalog/ProfileBadge') {
        return {
          BrandBadgeRail: (props) => React.createElement('BrandBadgeRail', props),
        };
      }
      if (request === '@/components/ui/VerifiedSeal') {
        return {
          SEAL_HEADER_SIZE: 20,
          StoreStatusSeal: (props) => React.createElement('StoreStatusSeal', props),
        };
      }
      if (request === '@/src/hooks/useResolvedImageUri') {
        return {
          useResolvedImageUri: ({ src }) => src ?? null,
        };
      }
      if (request === '@/src/toast/ToastContext') {
        return {
          useToast: () => ({ info: () => undefined, error: () => undefined }),
        };
      }
      if (request === '@/components/ui/MuseLoader') {
        return {
          MuseLoader: (props) => React.createElement('MuseLoader', props),
        };
      }

      const candidateBase = request.startsWith('@/')
        ? path.join(ROOT, request.slice(2))
        : path.resolve(path.dirname(resolved), request);

      for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
        const candidate = candidateBase + suffix;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTs(candidate);
        }
      }

      throw new Error(`Unhandled module import in test harness: ${request} (from ${resolved})`);
    };

    new Function('module', 'exports', 'require', transpiled)(
      module,
      module.exports,
      localRequire,
    );
    return module.exports;
  }

  return {
    setPlatform: (OS, Version) => {
      mockPlatform.OS = OS;
      mockPlatform.Version = Version;
    },
    setScheme: (scheme) => {
      currentScheme = scheme;
    },
    loadTs,
  };
}

function createNodeMock(element) {
  return {
    _mockHostType: element.type,
    __mockTestId: element.props?.testID ?? null,
  };
}

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectNodes(child, predicate, out);
    }
  }
  return out;
}

async function runTests() {
  const harness = createHarness();
  const { tokens } = harness.loadTs(path.join(ROOT, 'src', 'styles', 'tokens.ts'));
  const {
    WiezLiquidGlass,
    WiezLiquidGlassBackdrop,
    useLiquidGlassBlurTarget,
    getAndroidApiLevel,
    supportsEnhancedLiquidGlass,
  } = harness.loadTs(path.join(ROOT, 'components', 'ui', 'WiezLiquidGlass.tsx'));
  const { BrandProfileHeader } = harness.loadTs(
    path.join(ROOT, 'components', 'catalog', 'BrandProfileHeader.tsx'),
  );

  // ── 1. Optical Token & Opacity Envelope Checks ─────────────────────────────
  assert.equal(
    tokens.themes.light.colors.glassSurfaceStrong,
    'rgba(255,255,255,0.85)',
    'Global theme glassSurfaceStrong token must remain untouched in Phase 1',
  );

  for (const preset of ['subtle', 'regular', 'prominent']) {
    const lightLw = parseRgbaAlpha(tokens.liquidGlass.light.transmission.lightweight[preset]);
    const darkLw = parseRgbaAlpha(tokens.liquidGlass.dark.transmission.lightweight[preset]);
    assert.ok(
      lightLw >= 0.08 && lightLw <= 0.20,
      `Light lightweight ${preset} alpha (${lightLw}) must stay in [0.08, 0.20]`,
    );
    assert.ok(
      darkLw >= 0.12 && darkLw <= 0.28,
      `Dark lightweight ${preset} alpha (${darkLw}) must stay in [0.12, 0.28]`,
    );

    // Native TintStyle.kt adds 0.44 * (intensity/100) white on 'default' and
    // 0.55 * (intensity/100) dark neutral on 'systemUltraThinMaterialDark'.
    const lightTintAlpha = 0.44 * (tokens.liquidGlass.light.blurIntensity[preset] / 100);
    const lightFillAlpha = parseRgbaAlpha(tokens.liquidGlass.light.transmission.enhanced[preset]);
    const lightCombined = 1 - (1 - lightTintAlpha) * (1 - lightFillAlpha);
    assert.ok(
      lightCombined >= 0.08 && lightCombined <= 0.20,
      `Light enhanced ${preset} combined fill+tint (${lightCombined.toFixed(4)}) must stay in [0.08, 0.20]`,
    );

    const darkTintAlpha = 0.55 * (tokens.liquidGlass.dark.blurIntensity[preset] / 100);
    const darkFillAlpha = parseRgbaAlpha(tokens.liquidGlass.dark.transmission.enhanced[preset]);
    const darkCombined = 1 - (1 - darkTintAlpha) * (1 - darkFillAlpha);
    assert.ok(
      darkCombined >= 0.12 && darkCombined <= 0.28,
      `Dark enhanced ${preset} combined fill+tint (${darkCombined.toFixed(4)}) must stay in [0.12, 0.28]`,
    );
  }

  // ── 2. Platform & API-Level Detection ──────────────────────────────────────
  harness.setPlatform('android', 34);
  assert.equal(getAndroidApiLevel(), 34);
  assert.equal(supportsEnhancedLiquidGlass(), true);

  harness.setPlatform('android', '31');
  assert.equal(getAndroidApiLevel(), 31);
  assert.equal(supportsEnhancedLiquidGlass(), true);

  harness.setPlatform('android', 29);
  assert.equal(getAndroidApiLevel(), 29);
  assert.equal(supportsEnhancedLiquidGlass(), false);

  harness.setPlatform('ios', '18.2');
  assert.equal(getAndroidApiLevel(), null);
  assert.equal(supportsEnhancedLiquidGlass(), true);

  // ── 3. Mode A (Lightweight) Optical Stack & Highlight/Radius Edge Cases ────
  harness.setPlatform('android', 34);
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(
          'View',
          null,
          React.createElement(
            WiezLiquidGlass,
            {
              mode: 'lightweight',
              intensity: 'regular',
              borderRadius: tokens.radius.full,
              initialSize: { width: 120, height: 40 },
              accessibilityRole: 'button',
              accessibilityLabel: 'Filter',
              testID: `lw-${scheme}-1`,
            },
            React.createElement('ChildLabel', null, 'Glass'),
          ),
          React.createElement(
            WiezLiquidGlass,
            {
              mode: 'lightweight',
              intensity: 0.25,
              borderRadius: 16,
              highlightIntensity: false,
              pressed: true,
              initialSize: { width: 48, height: 48 },
              testID: `lw-${scheme}-no-hi`,
            },
            React.createElement('ChildLabel', null, 'Flat'),
          ),
        ),
        { createNodeMock },
      );
    });

    const json = tree.toJSON();
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);

    const first = collectNodes(json, (n) => n.props?.testID === `lw-${scheme}-1`)[0];
    assert.equal(first.props.accessibilityRole, 'button');
    assert.equal(first.props.accessibilityLabel, 'Filter');
    assert.equal(
      flattenStyle(first.props.style).borderRadius,
      20,
      'Full border radius must clamp cleanly to min(120,40)/2 = 20',
    );
    assert.equal(flattenStyle(first.props.style).elevation, 0);
    assert.equal(collectNodes(first, (n) => n.type === 'ExpoLinearGradient').length, 2);
    assert.equal(collectNodes(first, (n) => n.type === 'Svg').length, 1);

    assert.equal(
      collectNodes(
        first,
        (n) =>
          n.type === 'View' &&
          flattenStyle(n.props?.style).backgroundColor === tokens.liquidGlass[scheme].pressedOverlay,
      ).length,
      0,
      'pressed={false} must not render pressedOverlay sheen layer',
    );

    const noHi = collectNodes(json, (n) => n.props?.testID === `lw-${scheme}-no-hi`)[0];
    assert.equal(
      collectNodes(noHi, (n) => n.type === 'Svg').length,
      0,
      'highlightIntensity={false} must omit SVG specular rim',
    );
    assert.equal(
      collectNodes(noHi, (n) => n.type === 'ExpoLinearGradient').length,
      1,
      'highlightIntensity={false} omits directional reflection while keeping depth gradient',
    );
    assert.equal(
      collectNodes(
        noHi,
        (n) =>
          n.type === 'View' &&
          flattenStyle(n.props?.style).backgroundColor === tokens.liquidGlass[scheme].pressedOverlay,
      ).length,
      1,
      'pressed={true} must render pressedOverlay sheen layer',
    );

    await renderer.act(async () => tree.unmount());
  }

  // Dynamic onLayout measurement + tintMode override + unique sibling SVG gradient IDs
  harness.setScheme('light');
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(
          'View',
          null,
          React.createElement(WiezLiquidGlass, {
            mode: 'lightweight',
            tintMode: 'dark',
            borderRadius: tokens.radius.full,
            testID: 'dynamic-layout',
          }),
          React.createElement(WiezLiquidGlass, {
            initialSize: { width: 48, height: 48 },
          }),
          React.createElement(WiezLiquidGlass, {
            initialSize: { width: 48, height: 48 },
          }),
        ),
        { createNodeMock },
      );
    });
    const dynamicInitial = collectNodes(
      tree.toJSON(),
      (n) => n.props?.testID === 'dynamic-layout',
    )[0];
    assert.equal(
      collectNodes(dynamicInitial, (n) => n.type === 'Svg').length,
      0,
      'Without initialSize or layout event, SVG rim waits for measured dimensions',
    );
    assert.equal(
      collectNodes(
        dynamicInitial,
        (n) =>
          n.type === 'View' &&
          flattenStyle(n.props?.style).backgroundColor ===
            tokens.liquidGlass.dark.transmission.lightweight.regular,
      ).length,
      1,
      'tintMode="dark" must override light theme palette cleanly',
    );

    await renderer.act(async () => {
      dynamicInitial.props.onLayout({ nativeEvent: { layout: { width: 140, height: 40 } } });
    });
    const dynamicMeasured = collectNodes(
      tree.toJSON(),
      (n) => n.props?.testID === 'dynamic-layout',
    )[0];
    assert.equal(flattenStyle(dynamicMeasured.props.style).borderRadius, 20);
    assert.equal(
      collectNodes(dynamicMeasured, (n) => n.type === 'Svg').length,
      1,
      'onLayout triggers curved SVG specular rim at measured width x height',
    );

    const grads = collectNodes(tree.toJSON(), (n) => n.type === 'SvgLinearGradient');
    assert.equal(grads.length, 3);
    assert.notEqual(
      grads[1].props.id,
      grads[2].props.id,
      'Sibling SVG specular gradients must have distinct IDs so SVG defs do not collide',
    );
    await renderer.act(async () => tree.unmount());
  }

  // ── 4. Mode B (Enhanced) API 31+ Two-Stage Activation & API 29 Fallback ────
  function HarnessEnhanced({ mode = 'enhanced', tintMode = 'auto' }) {
    const { targetRef, blurTargetRef, onTargetLayout } = useLiquidGlassBlurTarget();
    return React.createElement(
      'View',
      null,
      React.createElement(
        WiezLiquidGlassBackdrop,
        { targetRef, onLayout: onTargetLayout, testID: 'backdrop' },
        React.createElement('BannerArtwork'),
      ),
      React.createElement(
        WiezLiquidGlass,
        {
          mode,
          tintMode,
          intensity: 'regular',
          blurTarget: blurTargetRef,
          initialSize: { width: 48, height: 48 },
          testID: 'glass-btn',
        },
        React.createElement('IconGlyph', null, '⋯'),
      ),
    );
  }

  // Android API 34: mounts BlurTargetView and activates dimezisBlurViewSdk31Plus cleanly
  harness.setPlatform('android', 34);
  harness.setScheme('dark');
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, {}), { createNodeMock });
    });
    const json = tree.toJSON();
    const targets = collectNodes(json, (n) => n.type === 'BlurTargetView');
    const blurs = collectNodes(json, (n) => n.type === 'BlurView');
    assert.equal(targets.length, 1, 'API 34 enhanced backdrop must render BlurTargetView');
    assert.equal(blurs.length, 1, 'API 34 enhanced surface must render 1 BlurView');
    assert.equal(blurs[0].props.blurMethod, 'dimezisBlurViewSdk31Plus');
    assert.equal(blurs[0].props.tint, 'systemUltraThinMaterialDark');
    assert.equal(blurs[0].props.intensity, 17);
    assert.equal(blurs[0].props.blurReductionFactor, 2.5);
    assert.ok(blurs[0].props.blurTarget?.current, 'BlurView must receive attached blurTarget');
    assert.equal(blurs[0].props.pointerEvents, 'none');
    assert.equal(blurs[0].props.importantForAccessibility, 'no-hide-descendants');
    await renderer.act(async () => tree.unmount());
  }

  // Android API 29: cleanly falls back to Mode A lightweight (zero BlurTargetView, zero BlurView)
  harness.setPlatform('android', 29);
  harness.setScheme('light');
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, {}), { createNodeMock });
    });
    const json = tree.toJSON();
    assert.equal(
      collectNodes(json, (n) => n.type === 'BlurTargetView').length,
      0,
      'API < 31 must skip BlurTargetView wrapper',
    );
    assert.equal(
      collectNodes(json, (n) => n.type === 'BlurView').length,
      0,
      'API < 31 must degrade cleanly to Mode A lightweight without BlurView',
    );
    await renderer.act(async () => tree.unmount());
  }

  // Mode B without blurTarget degrades safely without crashing or mounting BlurView
  harness.setPlatform('android', 34);
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(WiezLiquidGlass, {
          mode: 'enhanced',
          initialSize: { width: 48, height: 48 },
        }),
        { createNodeMock },
      );
    });
    assert.equal(collectNodes(tree.toJSON(), (n) => n.type === 'BlurView').length, 0);
    await renderer.act(async () => tree.unmount());
  }

  // ── 5. Catalog Integration (`BrandProfileHeader`) Light & Dark Tests ───────
  harness.setPlatform('android', 34);
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);
    let backTapped = 0;
    let menuTapped = 0;
    let notificationsTapped = 0;
    const menuAnchorRef = React.createRef();

    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(BrandProfileHeader, {
          brandName: 'Maison Vant',
          bannerUrl: 'https://cdn.example/banner.jpg',
          isOwner: true,
          onBack: () => {
            backTapped += 1;
          },
          onNotifications: () => {
            notificationsTapped += 1;
          },
          unreadNotificationCount: 5,
          onOpenMenu: () => {
            menuTapped += 1;
          },
          menuAnchorRef,
          onEditBanner: () => undefined,
        }),
        { createNodeMock },
      );
    });

    const json = tree.toJSON();
    const backBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Go back',
    )[0];
    const menuBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'More options',
    )[0];
    const notifBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Notifications',
    )[0];

    assert.ok(backBtn, `Go back button must render in ${scheme} theme`);
    assert.ok(menuBtn, `More options button must render in ${scheme} theme`);
    assert.ok(notifBtn, `Notifications button must render in ${scheme} theme`);
    assert.ok(menuAnchorRef.current, 'menuAnchorRef must stay attached for AppFloatingMenu');

    // Back button & menu button geometry and interaction preserved
    assert.equal(flattenStyle(backBtn.props.style).width, 48);
    assert.equal(flattenStyle(backBtn.props.style).height, 48);
    assert.equal(flattenStyle(backBtn.props.style).borderWidth, 0);
    assert.notEqual(
      flattenStyle(backBtn.props.style).backgroundColor,
      tokens.themes[scheme].colors.glassSurfaceStrong,
      'Catalog controls must no longer use opaque glassSurfaceStrong fill',
    );

    assert.equal(
      collectNodes(backBtn, (n) => n.type === 'BlurView').length,
      1,
      'Catalog Go back control must use enhanced Liquid Glass BlurView on Android API 34',
    );
    assert.equal(
      collectNodes(menuBtn, (n) => n.type === 'BlurView').length,
      1,
      'Catalog menu control must use enhanced Liquid Glass BlurView on Android API 34',
    );
    assert.equal(
      collectNodes(notifBtn, (n) => n.type === 'AppText' && n.children?.join('') === '5').length,
      1,
      'Notification badge count must remain visible inside the glass control',
    );

    // Backdrop isolation: BlurTargetView wraps banner artwork ONLY, never controls or BlurViews
    const blurTargetNode = collectNodes(json, (n) => n.type === 'BlurTargetView')[0];
    assert.ok(blurTargetNode, 'Banner must mount BlurTargetView backdrop on API 34');
    assert.equal(
      collectNodes(blurTargetNode, (n) => n.type === 'StableImage').length,
      1,
      'Banner artwork must live inside BlurTargetView',
    );
    assert.equal(
      collectNodes(blurTargetNode, (n) => n.type === 'Pressable' || n.type === 'BlurView').length,
      0,
      'Banner controls and BlurViews must sit outside BlurTargetView to prevent circular capture',
    );

    // Edit banner control intentionally unchanged in Phase 1
    const editBannerBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Edit banner',
    )[0];
    assert.ok(editBannerBtn);
    assert.equal(collectNodes(editBannerBtn, (n) => n.type === 'BlurView').length, 0);

    // Invoke handlers
    await renderer.act(async () => {
      backBtn.props.onPress();
      menuBtn.props.onPress();
      notifBtn.props.onPress();
    });
    assert.equal(backTapped, 1);
    assert.equal(menuTapped, 1);
    assert.equal(notificationsTapped, 1);

    await renderer.act(async () => tree.unmount());
  }

  // Non-owner visitor header configuration: Go back + Search + Share brand
  {
    harness.setScheme('light');
    let searchTapped = 0;
    let shareTapped = 0;
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(BrandProfileHeader, {
          brandName: 'Maison Vant',
          isOwner: false,
          onBack: () => undefined,
          onSearch: () => {
            searchTapped += 1;
          },
          onShare: () => {
            shareTapped += 1;
          },
        }),
        { createNodeMock },
      );
    });
    const json = tree.toJSON();
    const searchBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Search',
    )[0];
    const shareBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Share brand',
    )[0];
    assert.equal(collectNodes(searchBtn, (n) => n.type === 'BlurView').length, 1);
    assert.equal(collectNodes(shareBtn, (n) => n.type === 'BlurView').length, 1);
    await renderer.act(async () => {
      searchBtn.props.onPress();
      shareBtn.props.onPress();
    });
    assert.equal(searchTapped, 1);
    assert.equal(shareTapped, 1);
    await renderer.act(async () => tree.unmount());
  }

  // ── 6. Phase 1 Boundary: NativeIslandBottomNav untouched ───────────────────
  const islandSource = fs.readFileSync(
    path.join(ROOT, 'components', 'navigation', 'NativeIslandBottomNav.tsx'),
    'utf8',
  );
  assert.match(
    islandSource,
    /const USE_LIVE_BLUR = Platform\.OS === 'ios';/,
    'Phase 1 must not migrate NativeIslandBottomNav or alter its USE_LIVE_BLUR gate',
  );

  console.log(
    'PASS test-liquid-glass-phase1: Optical envelopes, Mode A/B gating, expo-blur@56 Android target sync, and Catalog banner integration verified across light & dark themes.',
  );
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
