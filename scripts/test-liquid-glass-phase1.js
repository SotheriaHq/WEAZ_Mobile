/**
 * Phase 1 Android Liquid Glass Component & Integration Tests
 *
 * Verifies:
 * 1. Optical transmission clarity across light & dark themes (91%+ transmission on native
 *    enhanced glass, eliminated heavy bottom depth shadows, outer-crescent-only reflection)
 * 2. Single hairline 0.85dp directional SVG rim in lightweight/fallback modes (no 2-ring
 *    dark metallic watch bezel)
 * 3. Android capability gating:
 *    - API 33+ native single-pass AGSL lens (micro-blur + meniscus refraction + chromatic edge)
 *    - API 31-32 native noise-free RenderEffect blur + JS hairline rim (0 Dimezis BlurView noise)
 *    - API < 31 / lightweight / unlinked native graceful fallback
 *    - `refraction={false}` toggle for benchmark & A/B parity
 * 4. Catalog banner integration (`BrandProfileHeader`) across light/dark & owner/visitor modes
 * 5. Phase 1 scope boundaries (`glassSurfaceStrong`, `Edit banner`, `NativeIslandBottomNav`)
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

function parseColorMock(input) {
  if (input === '#FFFFFF' || input === '#ffffff') return -1;
  if (input === '#141416') return -15461354;
  if (input === '#FAF5FF') return -330241;
  if (input === '#1A2230') return -15064528;
  return 0;
}

function createHarness() {
  let mockPlatform = { OS: 'android', Version: 36 };
  let currentScheme = 'light';
  let nativeAvailable = true;
  let supportsRuntimeShader = true;
  let supportsRenderEffectBlur = true;
  const moduleCache = new Map();
  let nextHandle = 100;
  const handleMap = new WeakMap();

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
  const NativeBackdropView = React.forwardRef((props, ref) =>
    React.createElement('WiezLiquidGlassBackdropView', { ...props, ref }, props.children),
  );
  const NativeLensView = (props) =>
    React.createElement('WiezLiquidGlassLensView', props, props.children);
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
          findNodeHandle: (node) => {
            if (!node || typeof node !== 'object') return null;
            if (!handleMap.has(node)) {
              nextHandle += 1;
              handleMap.set(node, nextHandle);
            }
            return handleMap.get(node);
          },
          processColor: parseColorMock,
          StyleSheet: {
            create: (obj) => obj,
            flatten: flattenStyle,
            absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
          },
          useWindowDimensions: () => ({ width: 412, height: 915, scale: 3, fontScale: 1 }),
          Linking: { openURL: async () => true },
        };
      }
      if (request === 'expo-modules-core') {
        return {
          requireOptionalNativeModule: (name) => {
            if (name !== 'WiezLiquidGlass' || !nativeAvailable) return null;
            return {
              supportsRuntimeShader,
              supportsRenderEffectBlur,
            };
          },
          requireNativeViewManager: (modName, viewName) => {
            if (modName === 'WiezLiquidGlass' && viewName === 'WiezLiquidGlassBackdropView') {
              return NativeBackdropView;
            }
            if (modName === 'WiezLiquidGlass' && viewName === 'WiezLiquidGlassLensView') {
              return NativeLensView;
            }
            return ViewWithRef;
          },
        };
      }
      if (request === '@/modules/wiez-liquid-glass/src') {
        return {
          isWiezLiquidGlassNativeAvailable: () =>
            mockPlatform.OS === 'android' && nativeAvailable,
          supportsWiezLiquidGlassRefraction: () =>
            mockPlatform.OS === 'android' && nativeAvailable && supportsRuntimeShader,
          supportsWiezLiquidGlassRenderEffectBlur: () =>
            mockPlatform.OS === 'android' && nativeAvailable && supportsRenderEffectBlur,
          getWiezLiquidGlassDiagnostics: () => ({
            available: mockPlatform.OS === 'android' && nativeAvailable,
            supportsRuntimeShader:
              mockPlatform.OS === 'android' && nativeAvailable && supportsRuntimeShader,
            supportsRenderEffectBlur:
              mockPlatform.OS === 'android' && nativeAvailable && supportsRenderEffectBlur,
            shaderCompileError: null,
            engineVersion: 2,
          }),
          getWiezLiquidGlassBackdropNativeView: () =>
            mockPlatform.OS === 'android' && nativeAvailable ? NativeBackdropView : null,
          getWiezLiquidGlassLensNativeView: () =>
            mockPlatform.OS === 'android' && nativeAvailable ? NativeLensView : null,
          toAndroidColorInt: (color) => parseColorMock(color),
        };
      }
      if (request === 'expo-blur') {
        return {
          BlurView: BlurViewComponent,
          BlurTargetView: ViewWithRef,
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
          Circle: (props) => React.createElement('SvgCircle', props, props.children),
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
    setNativeCaps: ({ available = true, runtimeShader = true, renderEffectBlur = true }) => {
      nativeAvailable = available;
      supportsRuntimeShader = runtimeShader;
      supportsRenderEffectBlur = renderEffectBlur;
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
    supportsNativeLiquidGlassRefraction,
    getLiquidGlassCapabilities,
  } = harness.loadTs(path.join(ROOT, 'components', 'ui', 'WiezLiquidGlass.tsx'));
  const { BrandProfileHeader } = harness.loadTs(
    path.join(ROOT, 'components', 'catalog', 'BrandProfileHeader.tsx'),
  );

  // ── 1. Corrected Optical Clarity & Anti-Metallic Token Envelopes ────────────
  assert.equal(
    tokens.themes.light.colors.glassSurfaceStrong,
    'rgba(255,255,255,0.85)',
    'Global theme glassSurfaceStrong token must remain untouched in Phase 1',
  );

  for (const preset of ['subtle', 'regular', 'prominent']) {
    const lightLw = parseRgbaAlpha(tokens.liquidGlass.light.transmission.lightweight[preset]);
    const darkLw = parseRgbaAlpha(tokens.liquidGlass.dark.transmission.lightweight[preset]);
    const lightEnh = parseRgbaAlpha(tokens.liquidGlass.light.transmission.enhanced[preset]);
    const darkEnh = parseRgbaAlpha(tokens.liquidGlass.dark.transmission.enhanced[preset]);

    assert.ok(
      lightLw >= 0.04 && lightLw <= 0.13,
      `Light lightweight ${preset} alpha (${lightLw}) must stay sheer in [0.04, 0.13]`,
    );
    assert.ok(
      darkLw >= 0.05 && darkLw <= 0.15,
      `Dark lightweight ${preset} alpha (${darkLw}) must stay sheer in [0.05, 0.15]`,
    );
    assert.ok(
      lightEnh >= 0.015 && lightEnh <= 0.07,
      `Light enhanced ${preset} tint (${lightEnh}) must preserve >= 93% transmission`,
    );
    assert.ok(
      darkEnh >= 0.02 && darkEnh <= 0.09,
      `Dark enhanced ${preset} tint (${darkEnh}) must preserve >= 91% transmission without dark mud`,
    );
    assert.equal(
      tokens.liquidGlass.light.opticalBlurDp[preset],
      0,
      `Light opticalBlurDp.${preset} must stay 0 for crystal-clear center transmission`,
    );
    assert.equal(
      tokens.liquidGlass.dark.opticalBlurDp[preset],
      0,
      `Dark opticalBlurDp.${preset} must stay 0 for crystal-clear center transmission`,
    );
  }

  // Menu three-dot glyph contrast envelope & Android Island balanced sheen
  assert.equal(tokens.liquidGlass.menuGlyphFill, '#FFFFFF');
  assert.ok(
    parseRgbaAlpha(tokens.liquidGlass.menuGlyphStroke) >= 0.75,
    'Three-dot glyph outer contrast stroke must stay legible over white banners',
  );
  for (const sheenKey of ['androidSheenLight', 'androidSheenDark']) {
    const stops = tokens.island[sheenKey];
    assert.equal(stops.length, 3, `${sheenKey} must have 3 vertical sheen stops`);
    const midAlpha = parseRgbaAlpha(stops[1]);
    assert.ok(
      midAlpha >= 0.55 && midAlpha <= 0.65,
      `${sheenKey} center stop (${midAlpha}) must preserve open background visibility while protecting label contrast`,
    );
  }

  for (const scheme of ['light', 'dark']) {
    const bottomDepthAlpha = parseRgbaAlpha(tokens.liquidGlass[scheme].depthColors[3]);
    assert.ok(
      bottomDepthAlpha <= 0.04,
      `${scheme} bottom depth alpha (${bottomDepthAlpha}) must not reintroduce metallic bottom darkening`,
    );
    const reflectionEndAlpha = parseRgbaAlpha(tokens.liquidGlass[scheme].reflectionColors[2]);
    assert.equal(
      reflectionEndAlpha,
      0,
      `${scheme} reflection tail must drop completely to 0 before reaching center`,
    );
  }

  // ── 2. Platform, API-Level & Refraction Capability Detection ────────────────
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
  assert.equal(getAndroidApiLevel(), 36);
  assert.equal(supportsEnhancedLiquidGlass(), true);
  assert.equal(supportsNativeLiquidGlassRefraction(), true);

  harness.setPlatform('android', '31');
  harness.setNativeCaps({ available: true, runtimeShader: false, renderEffectBlur: true });
  assert.equal(getAndroidApiLevel(), 31);
  assert.equal(supportsEnhancedLiquidGlass(), true);
  assert.equal(supportsNativeLiquidGlassRefraction(), false);

  harness.setPlatform('android', 29);
  harness.setNativeCaps({ available: true, runtimeShader: false, renderEffectBlur: false });
  assert.equal(getAndroidApiLevel(), 29);
  assert.equal(supportsEnhancedLiquidGlass(), false);
  assert.equal(supportsNativeLiquidGlassRefraction(), false);

  harness.setPlatform('ios', '18.2');
  assert.equal(getAndroidApiLevel(), null);
  assert.equal(supportsEnhancedLiquidGlass(), true);
  assert.equal(supportsNativeLiquidGlassRefraction(), false);

  // ── 3. Mode A (Lightweight) Optical Stack & Single Hairline Rim ────────────
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
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
    assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);

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

    // Must render ONLY ONE hairline specular Rect (0.85dp) — never 2-ring metallic bezel
    const rects = collectNodes(first, (n) => n.type === 'SvgRect');
    assert.equal(rects.length, 1, 'Lightweight rim must use 1 single hairline stroke, never a 2-ring bezel');
    assert.ok(rects[0].props.strokeWidth < 1, 'Hairline rim strokeWidth must be sub-1dp');

    assert.equal(
      collectNodes(
        first,
        (n) =>
          n.type === 'View' &&
          flattenStyle(n.props?.style).backgroundColor === tokens.liquidGlass[scheme].pressedOverlay,
      ).length,
      0,
    );

    const noHi = collectNodes(json, (n) => n.props?.testID === `lw-${scheme}-no-hi`)[0];
    assert.equal(collectNodes(noHi, (n) => n.type === 'Svg').length, 0);
    assert.equal(collectNodes(noHi, (n) => n.type === 'ExpoLinearGradient').length, 1);
    assert.equal(
      collectNodes(
        noHi,
        (n) =>
          n.type === 'View' &&
          flattenStyle(n.props?.style).backgroundColor === tokens.liquidGlass[scheme].pressedOverlay,
      ).length,
      1,
    );

    await renderer.act(async () => tree.unmount());
  }

  // Dynamic onLayout measurement + unique SVG gradient IDs
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
    assert.equal(collectNodes(dynamicInitial, (n) => n.type === 'Svg').length, 0);

    await renderer.act(async () => {
      dynamicInitial.props.onLayout({ nativeEvent: { layout: { width: 140, height: 40 } } });
    });
    const dynamicMeasured = collectNodes(
      tree.toJSON(),
      (n) => n.props?.testID === 'dynamic-layout',
    )[0];
    assert.equal(flattenStyle(dynamicMeasured.props.style).borderRadius, 20);
    assert.equal(collectNodes(dynamicMeasured, (n) => n.type === 'Svg').length, 1);

    const grads = collectNodes(tree.toJSON(), (n) => n.type === 'SvgLinearGradient');
    assert.equal(grads.length, 3);
    assert.notEqual(grads[1].props.id, grads[2].props.id);
    await renderer.act(async () => tree.unmount());
  }

  // ── 4. Mode B (Enhanced) API 33+ AGSL, API 31-32 Blur, API 29 Fallback ────
  function HarnessEnhanced({ mode = 'enhanced', tintMode = 'auto', refraction = true, pressed = false }) {
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
          refraction,
          pressed,
          intensity: 'regular',
          blurTarget: blurTargetRef,
          initialSize: { width: 48, height: 48 },
          testID: 'glass-btn',
        },
        React.createElement('IconGlyph', null, '⋯'),
      ),
    );
  }

  // Android API 36 (AGSL single-pass refraction + micro-blur): 0 Dimezis BlurView, 0 stacked JS SVG/gradients
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
  harness.setScheme('dark');
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, { pressed: true }), {
        createNodeMock,
      });
    });
    const json = tree.toJSON();
    const backdrops = collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView');
    const lenses = collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView');
    assert.equal(backdrops.length, 1, 'API 36 enhanced backdrop must mount WiezLiquidGlassBackdropView');
    assert.equal(lenses.length, 1, 'API 36 enhanced control must mount WiezLiquidGlassLensView');
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0, 'Must never mount noisy Dimezis BlurView on Android');
    assert.equal(collectNodes(json, (n) => n.type === 'Svg').length, 0, 'API 33+ AGSL composites rim directly without duplicate SVG stack');
    assert.equal(collectNodes(json, (n) => n.type === 'ExpoLinearGradient').length, 0, 'API 33+ AGSL composites reflection without haze layers');
    assert.ok(lenses[0].props.targetViewId > 0, 'Native lens must receive valid targetViewId handle');
    assert.ok(
      lenses[0].props.refractionStrength >= 1.0 && lenses[0].props.refractionStrength <= 1.15,
      'Optical Balance v4 regular intensity must calibrate refractionStrength around 1.02',
    );
    assert.equal(lenses[0].props.curvature, 0.66, 'Optical Balance v4 default curvature must be 0.66');
    assert.equal(lenses[0].props.opticalThickness, 0.55, 'Optical Balance v4 default opticalThickness must be 0.55');
    assert.equal(lenses[0].props.blurRadius, 0, 'API 33+ lens must have 0dp center Gaussian blur');
    assert.equal(lenses[0].props.chromaticAberration, 0, 'Chromatic aberration must stay disabled (0)');
    assert.equal(lenses[0].props.isDark, true);
    assert.equal(lenses[0].props.pressed, true);
    assert.ok(lenses[0].props.tintAlpha <= 0.06, 'Dark-theme native tint must remain crystal sheer');
    await renderer.act(async () => tree.unmount());
  }

  // Verify v2 Kotlin/AGSL Material-System optical shader invariants & crash/fringe fixes
  {
    const rendererSource = fs.readFileSync(
      path.join(
        ROOT,
        'modules',
        'wiez-liquid-glass',
        'android',
        'src',
        'main',
        'java',
        'expo',
        'modules',
        'wiezliquidglass',
        'LiquidGlassRenderers.kt',
      ),
      'utf8',
    );
    const agslMatch = /private const val LIQUID_GLASS_AGSL = """([\s\S]*?)"""/.exec(rendererSource);
    assert.ok(agslMatch, 'LIQUID_GLASS_AGSL shader source must exist');
    const agsl = agslMatch[1];

    // Valid AGSL only — no SkSL 'h' or 'f' float suffixes that crash Android RuntimeShader compilation
    assert.doesNotMatch(
      agsl,
      /\b\d+(?:\.\d+)?[hf]\b/,
      'AGSL source must NOT use SkSL half/float literal suffixes (h/f)',
    );
    // Honest compile diagnostics (no swallowed silent compile failures)
    assert.match(
      rendererSource,
      /Log\.e\(LOG_TAG,\s*"AGSL RuntimeShader compilation failed/,
      'Shader compilation failure must be logged loudly via Log.e',
    );
    assert.doesNotMatch(
      rendererSource,
      /recordingCanvas\.drawColor\(config\.fallbackColorArgb\)/,
      'RenderNodes must NEVER fill fallbackColorArgb behind targetView (prevents dark #1A2230 perimeter fringe)',
    );
    assert.match(agsl, /uniform float4 uShapeParams;/, 'Shader must accept dynamic curvature & thickness uniforms');
    assert.match(agsl, /float2 rawGrad = float2\(gx, gy\)/, 'Shader must compute smooth C1 finite-difference SDF normals');
    assert.match(agsl, /fragCoord - lensNormal \* edgeShiftPx/, 'Shader must apply convex physical Snell inward sampling');
    assert.match(agsl, /bezelReachDp/, 'Meniscus bevel must adapt cleanly across circles, pills, and cards');
    assert.match(agsl, /float rampEnd = mix\(/, 'Shader must use C2 Hermite-integrated smooth-ramp meniscus profile');
    assert.match(agsl, /float peakNormSlope = 1\.0 \/ max\(totalArea,\s*0\.25\)/, 'Shader must compute peak normalized meniscus slope for Jacobian clamping');
    assert.match(agsl, /float maxSlope = clamp\(refractStr \* 0\.54,\s*0\.0,\s*0\.72\)/, 'Shader must enforce restrained monotonic Jacobian slope bound <= 0.72');
    assert.match(agsl, /float physicalCapPx = \(bezelWidth \* maxSlope\) \/ max\(peakNormSlope,\s*1\.0\)/, 'Shader must cap edge shift against bezelWidth and peakNormSlope to prevent caustic folding and text twisting');
    assert.match(agsl, /float smoothEdgeT = smoothstep\(0\.0,\s*1\.0,\s*edgeT\)/, 'Optical tint transition must smoothstep cleanly from flat core to rim');
    assert.doesNotMatch(agsl, /float3\(0\.16,\s*0\.19,\s*0\.30\)/, 'Optical bevel shading must stay neutral achromatic instead of blue-lavender indigo');
    assert.match(agsl, /veryBrightBg/, 'Shader must isolate very bright backgrounds for subtle inboard optical edge definition');
    assert.match(agsl, /inboardShadow/, 'Shader must compute smooth inboard optical shadow on bright grounds without harsh strokes');
    assert.match(agsl, /totalShade/, 'Shader must blend bounded neutral bevel and inboard shade');
    assert.match(agsl, /rgb = mix\(rgb,\s*float3\(0\.055,\s*0\.055,\s*0\.06\),\s*totalShade\)/, 'Bright backdrops must use compact neutral charcoal optical lip depth');
    assert.match(agsl, /glossSecDir/, 'Shader must include delicate secondary opposite meniscus catchlight without plastic sheet wash');
    assert.doesNotMatch(agsl, /corePull/, 'Central optical core must have zero displacement/pull');
    assert.doesNotMatch(agsl, /outerEdgeMask/, 'Lens must not draw a thin wireframe outerEdgeMask outline');
    assert.match(agsl, /bgLuma/, 'Fresnel rim must adapt to sampled background luminance');
    assert.match(agsl, /bevelShadeCurve/, 'Bright backdrops must use soft beveled edge depth rather than a 1px dark ring');

    assert.equal(
      tokens.liquidGlass.dark.tintHex,
      '#141416',
      'Dark-theme liquid glass tint must stay neutral charcoal (#141416) without indigo/lavender bias',
    );

    const lensViewSource = fs.readFileSync(
      path.join(ROOT, 'modules', 'wiez-liquid-glass', 'android', 'src', 'main', 'java', 'expo', 'modules', 'wiezliquidglass', 'WiezLiquidGlassLensView.kt'),
      'utf8',
    );
    const moduleSource = fs.readFileSync(
      path.join(ROOT, 'modules', 'wiez-liquid-glass', 'android', 'src', 'main', 'java', 'expo', 'modules', 'wiezliquidglass', 'WiezLiquidGlassModule.kt'),
      'utf8',
    );
    assert.match(lensViewSource, /refractionStrength:\s*Float\s*=\s*1\.02f/, 'Kotlin LensView default refractionStrength must match TS v4 (1.02f)');
    assert.match(lensViewSource, /curvature:\s*Float\s*=\s*0\.66f/, 'Kotlin LensView default curvature must match TS v4 (0.66f)');
    assert.match(lensViewSource, /opticalThickness:\s*Float\s*=\s*0\.55f/, 'Kotlin LensView default opticalThickness must match TS v4 (0.55f)');
    assert.match(moduleSource, /refractionStrength\s*\?:\s*1\.02f/, 'Kotlin Module prop fallback refractionStrength must match TS v4 (1.02f)');
    assert.match(moduleSource, /curvature\s*\?:\s*0\.66f/, 'Kotlin Module prop fallback curvature must match TS v4 (0.66f)');
    assert.match(moduleSource, /opticalThickness\s*\?:\s*0\.55f/, 'Kotlin Module prop fallback opticalThickness must match TS v4 (0.55f)');
  }

  // Android API 36 with `refraction={false}` opt-out (for A/B telemetry & fallback)
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, { refraction: false }), {
        createNodeMock,
      });
    });
    const lenses = collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView');
    assert.equal(lenses[0].props.refractionStrength, 0);
    assert.equal(lenses[0].props.chromaticAberration, 0);
    await renderer.act(async () => tree.unmount());
  }

  // Android API 31: Clean noise-free RenderEffect blur lens + single hairline JS SVG rim
  harness.setPlatform('android', 31);
  harness.setNativeCaps({ available: true, runtimeShader: false, renderEffectBlur: true });
  harness.setScheme('light');
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, {}), { createNodeMock });
    });
    const json = tree.toJSON();
    const lenses = collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView');
    assert.equal(lenses.length, 1, 'API 31 must use clean RenderEffect native lens instead of noisy Dimezis BlurView');
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
    assert.equal(lenses[0].props.refractionStrength, 0);
    assert.equal(
      lenses[0].props.blurRadius,
      4,
      'API 31-32 RenderEffect fallback must derive non-zero blur from blurIntensity / blurReductionFactor (12 / 3 = 4)',
    );
    assert.equal(collectNodes(json, (n) => n.type === 'SvgRect').length, 1, 'API 31-32 renders single thin SVG directional rim');
    await renderer.act(async () => tree.unmount());
  }

  // Android API 29: cleanly falls back to lightweight (0 native backdrop/lens, 0 BlurView)
  harness.setPlatform('android', 29);
  harness.setNativeCaps({ available: false, runtimeShader: false, renderEffectBlur: false });
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, {}), { createNodeMock });
    });
    const json = tree.toJSON();
    assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView').length, 0);
    assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
    assert.equal(collectNodes(json, (n) => n.type === 'SvgRect').length, 1);
    await renderer.act(async () => tree.unmount());
  }

  // Unlinked native module or omitted blurTarget gracefully degrades on API 36
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: false, runtimeShader: false, renderEffectBlur: false });
  {
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessEnhanced, {}), { createNodeMock });
    });
    assert.equal(collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
    assert.equal(collectNodes(tree.toJSON(), (n) => n.type === 'SvgRect').length, 1);
    await renderer.act(async () => tree.unmount());
  }

  // ── 5. Catalog Integration (`BrandProfileHeader`) Light & Dark Tests ───────
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
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

    assert.equal(flattenStyle(backBtn.props.style).width, 48);
    assert.equal(flattenStyle(backBtn.props.style).height, 48);
    assert.equal(flattenStyle(backBtn.props.style).borderWidth, 0);
    assert.notEqual(
      flattenStyle(backBtn.props.style).backgroundColor,
      tokens.themes[scheme].colors.glassSurfaceStrong,
    );

    assert.equal(
      collectNodes(backBtn, (n) => n.type === 'WiezLiquidGlassLensView').length,
      1,
      'Catalog Go back control must mount hardware WiezLiquidGlassLensView on Android API 36',
    );
    assert.equal(
      collectNodes(menuBtn, (n) => n.type === 'WiezLiquidGlassLensView').length,
      1,
      'Catalog menu control must mount hardware WiezLiquidGlassLensView on Android API 36',
    );
    const menuDots = collectNodes(menuBtn, (n) => n.type === 'SvgCircle');
    assert.equal(
      menuDots.length,
      3,
      `Catalog three-dot menu icon must render 3 outlined vector dots for bright/dark banner contrast in ${scheme} theme`,
    );
    assert.equal(menuDots[0].props.fill, tokens.liquidGlass.menuGlyphFill);
    assert.equal(menuDots[0].props.stroke, tokens.liquidGlass.menuGlyphStroke);
    assert.equal(
      collectNodes(notifBtn, (n) => n.type === 'AppText' && n.children?.join('') === '5').length,
      1,
      'Notification badge count must remain visible inside the glass control',
    );
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);

    // Backdrop isolation: WiezLiquidGlassBackdropView wraps artwork ONLY, never buttons or lenses
    const backdropNode = collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView')[0];
    assert.ok(backdropNode, 'Banner must mount WiezLiquidGlassBackdropView on API 36');
    assert.equal(collectNodes(backdropNode, (n) => n.type === 'StableImage').length, 1);
    assert.equal(
      collectNodes(
        backdropNode,
        (n) => n.type === 'Pressable' || n.type === 'WiezLiquidGlassLensView',
      ).length,
      0,
      'Banner controls and glass lenses must remain sibling/outside WiezLiquidGlassBackdropView',
    );

    // Edit banner square control intentionally untouched in Phase 1
    const editBannerBtn = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Edit banner',
    )[0];
    assert.ok(editBannerBtn);
    assert.equal(collectNodes(editBannerBtn, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);

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
    assert.equal(collectNodes(searchBtn, (n) => n.type === 'WiezLiquidGlassLensView').length, 1);
    assert.equal(collectNodes(shareBtn, (n) => n.type === 'WiezLiquidGlassLensView').length, 1);
    assert.equal(collectNodes(shareBtn, (n) => n.type === 'SvgCircle').length, 3);
    await renderer.act(async () => {
      searchBtn.props.onPress();
      shareBtn.props.onPress();
    });
    assert.equal(searchTapped, 1);
    assert.equal(shareTapped, 1);
    await renderer.act(async () => tree.unmount());
  }

  // ── 6. Phase 1 Boundary: NativeIslandBottomNav stays free of backdrop-capture migration ──
  const islandSource = fs.readFileSync(
    path.join(ROOT, 'components', 'navigation', 'NativeIslandBottomNav.tsx'),
    'utf8',
  );
  assert.match(
    islandSource,
    /const USE_LIVE_BLUR = Platform\.OS === 'ios';/,
    'Phase 1 must not migrate NativeIslandBottomNav or alter its USE_LIVE_BLUR gate',
  );
  assert.doesNotMatch(
    islandSource,
    /WiezLiquidGlass/,
    'NativeIslandBottomNav must NOT migrate to full-screen backdrop capture or WiezLiquidGlass in this scoped pass',
  );
  assert.match(
    islandSource,
    /androidSheenDark/,
    'NativeIslandBottomNav Android surface must use balanced tokens.island.androidSheen*',
  );

  // ── 7. v2 Material System: Arbitrary Shapes, Optical Props & Capabilities ─
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
  {
    const caps = getLiquidGlassCapabilities();
    assert.equal(caps.engineVersion, 2);
    assert.equal(caps.agslRefractionSupported, true);
    assert.equal(caps.shaderCompileError, null);

    function HarnessShapes() {
      const { targetRef, blurTargetRef, onTargetLayout } = useLiquidGlassBlurTarget();
      return React.createElement(
        'View',
        null,
        React.createElement(
          WiezLiquidGlassBackdrop,
          { targetRef, onLayout: onTargetLayout },
          React.createElement('GridStage'),
        ),
        React.createElement(WiezLiquidGlass, {
          mode: 'enhanced',
          blurTarget: blurTargetRef,
          borderRadius: tokens.radius.full,
          initialSize: { width: 240, height: 52 },
          refractionStrength: 1.55,
          curvature: 0.75,
          opticalThickness: 0.72,
          blurRadius: 0,
          fresnelIntensity: 1.2,
          reflectionIntensity: 1.1,
          tintAlpha: 0.04,
          chromaticAberration: 0,
          testID: 'shape-pill',
        }),
        React.createElement(WiezLiquidGlass, {
          mode: 'enhanced',
          blurTarget: blurTargetRef,
          borderRadius: tokens.radius.xl,
          initialSize: { width: 296, height: 104 },
          curvature: 0.9,
          opticalThickness: 0.85,
          blurRadius: 6,
          testID: 'shape-card',
        }),
      );
    }

    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(HarnessShapes), { createNodeMock });
    });
    const lenses = collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView');
    assert.equal(lenses.length, 2, 'Both pill and rounded card must mount hardware lenses');
    assert.equal(lenses[0].props.cornerRadius, 26, 'Pill borderRadius must clamp cleanly to height/2');
    assert.equal(lenses[0].props.refractionStrength, 1.55);
    assert.equal(lenses[0].props.curvature, 0.75);
    assert.equal(lenses[0].props.opticalThickness, 0.72);
    assert.equal(lenses[0].props.rimStrength, 1.2);
    assert.equal(lenses[0].props.reflectionStrength, 1.1);
    assert.equal(lenses[0].props.fallbackColor, 0, 'Lens fallbackColor must stay transparent (0)');
    assert.equal(lenses[1].props.cornerRadius, 24, 'Card borderRadius must preserve 24dp rounding');
    assert.equal(lenses[1].props.curvature, 0.9);
    assert.equal(lenses[1].props.blurRadius, 6, 'Optional scatter blurRadius must forward cleanly');
    await renderer.act(async () => tree.unmount());
  }

  // ── 8. Temporary Optical Lab Complete Removal & Unreachability Checks ─────
  assert.equal(
    fs.existsSync(path.join(ROOT, 'app', 'dev', 'liquid-glass-lab.tsx')),
    false,
    'Temporary Optical Lab route app/dev/liquid-glass-lab.tsx must be completely removed',
  );
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src', 'features', 'dev', 'liquidGlassLabGate.ts')),
    false,
    'Temporary Optical Lab gate src/features/dev/liquidGlassLabGate.ts must be completely removed',
  );

  const rootLayoutSource = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
  assert.doesNotMatch(
    rootLayoutSource,
    /dev\/liquid-glass-lab/,
    'Root navigator must not register dev/liquid-glass-lab',
  );

  const themeSettingsSource = fs.readFileSync(
    path.join(ROOT, 'app', 'settings', 'theme.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    themeSettingsSource,
    /liquid-glass-lab|liquidGlassLabGate|isLiquidGlassLabEnabled|Liquid Glass Optical Lab/,
    'Appearance settings must not expose Optical Lab debug entry controls',
  );
  assert.match(
    themeSettingsSource,
    /<SettingsSectionHeading title="Colour theme" \/>/,
    'Appearance settings must retain Rule 37 Colour theme section heading',
  );

  const notificationRoutingSource = fs.readFileSync(
    path.join(ROOT, 'src', 'utils', 'notificationRouting.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    notificationRoutingSource,
    /liquid-glass-lab|resolveLiquidGlassLabRoute|isLiquidGlassLabEnabled/,
    'Deep-link router must not handle or navigate to Optical Lab URLs',
  );

  const mobileRoutingSource = fs.readFileSync(
    path.join(ROOT, 'src', 'utils', 'mobileRouting.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    mobileRoutingSource,
    /liquid-glass-lab/,
    'Mobile notification route mapper must not reference Optical Lab',
  );
  const vm = require('node:vm');
  const routingModule = { exports: {} };
  const compiledMobileRouting = ts.transpileModule(mobileRoutingSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiledMobileRouting, {
    module: routingModule,
    exports: routingModule.exports,
    URL,
    URLSearchParams,
  });
  for (const labUrl of [
    'wiezmobile://dev/liquid-glass-lab',
    'wiezmobile://dev/liquid-glass-lab?mode=v4',
    '/dev/liquid-glass-lab',
  ]) {
    const resolvedLabFallback = routingModule.exports.routeForNotification({
      type: 'SYSTEM',
      targetUrl: labUrl,
      payload: { targetUrl: labUrl },
      target: null,
      actor: null,
      subTargetId: null,
    });
    assert.equal(
      resolvedLabFallback,
      '/notifications',
      `Deep link ${labUrl} must never resolve to Optical Lab`,
    );
  }

  assert.equal(
    'lab' in tokens.liquidGlass,
    false,
    'Diagnostic tokens.liquidGlass.lab palette must be removed while preserving reusable material tokens',
  );

  const appTextSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'AppText.tsx'), 'utf8');
  assert.doesNotMatch(
    appTextSource,
    /LIGHT_STAGE_THEME|onLightStage/,
    'AppText must not retain Optical Lab-only LIGHT_STAGE_THEME / onLightStage props',
  );

  // Sweep all runtime source directories (app/, components/, src/) for stale Lab symbols
  function walkRuntimeFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walkRuntimeFiles(fullPath, out);
      } else if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
        out.push(fullPath);
      }
    }
    return out;
  }
  const staleLabPattern = /liquid-glass-lab|liquidGlassLab|isLiquidGlassLabEnabled|resolveLiquidGlassLabRoute/;
  for (const dirName of ['app', 'components', 'src']) {
    for (const filePath of walkRuntimeFiles(path.join(ROOT, dirName))) {
      const fileSource = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(
        fileSource,
        staleLabPattern,
        `Runtime file ${path.relative(ROOT, filePath)} must not reference removed Optical Lab`,
      );
    }
  }

  // ── 9. Phase 2 Consolidation & Regression Fixes ───────────────────────────
  // 9a. Single-source optics defaults in tokens match Phase 1 v4 baseline
  assert.equal(tokens.liquidGlass.optics.curvature, 0.66);
  assert.equal(tokens.liquidGlass.optics.opticalThickness, 0.55);
  assert.equal(tokens.liquidGlass.optics.chromaticAberration, 0);
  assert.equal(tokens.liquidGlass.optics.refractionStrength.subtle, 0.74);
  assert.equal(tokens.liquidGlass.optics.refractionStrength.regular, 1.02);
  assert.equal(tokens.liquidGlass.optics.refractionStrength.prominent, 1.2);

  // 9b. initialSize seeds first paint BEFORE layout, while onLayout updates flexible surfaces
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
  harness.setScheme('light');
  {
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
              borderRadius: tokens.radius.full,
              initialSize: { width: 120, height: 40 },
              pointerEvents: 'none',
              testID: 'flexible-pill',
            },
            React.createElement('ChildLabel', null, 'Initial'),
          ),
          React.createElement(
            WiezLiquidGlass,
            {
              mode: 'lightweight',
              borderRadius: tokens.radius.full,
              initialSize: { width: 48, height: 48 },
              style: { width: 48, height: 48 },
              testID: 'fixed-circle',
            },
            React.createElement('ChildLabel', null, '48'),
          ),
        ),
        { createNodeMock },
      );
    });

    const pillInitial = collectNodes(tree.toJSON(), (n) => n.props?.testID === 'flexible-pill')[0];
    assert.equal(pillInitial.props.pointerEvents, 'none', 'pointerEvents prop must forward to root View');
    assert.equal(flattenStyle(pillInitial.props.style).borderRadius, 20);
    assert.equal(collectNodes(pillInitial, (n) => n.type === 'Svg')[0].props.width, 120);
    assert.equal(collectNodes(pillInitial, (n) => n.type === 'Svg')[0].props.height, 40);

    await renderer.act(async () => {
      pillInitial.props.onLayout({ nativeEvent: { layout: { width: 180, height: 60 } } });
    });
    const pillResized = collectNodes(tree.toJSON(), (n) => n.props?.testID === 'flexible-pill')[0];
    assert.equal(
      flattenStyle(pillResized.props.style).borderRadius,
      30,
      'onLayout resize must update borderRadius clamping beyond initialSize seed',
    );
    assert.equal(collectNodes(pillResized, (n) => n.type === 'Svg')[0].props.width, 180);
    assert.equal(collectNodes(pillResized, (n) => n.type === 'Svg')[0].props.height, 60);

    const fixedCircle = collectNodes(tree.toJSON(), (n) => n.props?.testID === 'fixed-circle')[0];
    await renderer.act(async () => {
      fixedCircle.props.onLayout({ nativeEvent: { layout: { width: 64, height: 64 } } });
    });
    const fixedAfter = collectNodes(tree.toJSON(), (n) => n.props?.testID === 'fixed-circle')[0];
    assert.equal(
      collectNodes(fixedAfter, (n) => n.type === 'Svg')[0].props.width,
      48,
      'Fixed numeric style dimensions must take precedence over onLayout changes',
    );
    await renderer.act(async () => tree.unmount());
  }

  // 9c. API 31-32 RenderEffect blur preset scaling & explicit 0 override vs AGSL 0dp invariance
  {
    function HarnessBlur({ intensity = 'regular', blurRadius }) {
      const { targetRef, blurTargetRef, onTargetLayout } = useLiquidGlassBlurTarget();
      return React.createElement(
        'View',
        null,
        React.createElement(WiezLiquidGlassBackdrop, { targetRef, onLayout: onTargetLayout }),
        React.createElement(WiezLiquidGlass, {
          mode: 'enhanced',
          intensity,
          blurRadius,
          blurTarget: blurTargetRef,
          initialSize: { width: 48, height: 48 },
        }),
      );
    }

    harness.setPlatform('android', 31);
    harness.setNativeCaps({ available: true, runtimeShader: false, renderEffectBlur: true });
    for (const [intensity, expectedBlur] of [
      ['subtle', 2.7],
      ['regular', 4],
      ['prominent', 5.3],
    ]) {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(React.createElement(HarnessBlur, { intensity }), { createNodeMock });
      });
      const lens = collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView')[0];
      assert.equal(
        lens.props.blurRadius,
        expectedBlur,
        `API 31 ${intensity} RenderEffect blur must equal ${expectedBlur}dp`,
      );
      await renderer.act(async () => tree.unmount());
    }

    // Explicit blurRadius={0} opt-out honored on API 31-32
    {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(HarnessBlur, { intensity: 'prominent', blurRadius: 0 }),
          { createNodeMock },
        );
      });
      const lens = collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView')[0];
      assert.equal(lens.props.blurRadius, 0, 'Explicit blurRadius={0} override must disable API 31 blur');
      await renderer.act(async () => tree.unmount());
    }

    // API 33+ AGSL preserves strictly 0dp default even on prominent intensity
    harness.setPlatform('android', 37);
    harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
    {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(React.createElement(HarnessBlur, { intensity: 'prominent' }), {
          createNodeMock,
        });
      });
      const lens = collectNodes(tree.toJSON(), (n) => n.type === 'WiezLiquidGlassLensView')[0];
      assert.equal(lens.props.blurRadius, 0, 'API 33+ AGSL prominent preset must remain strictly 0dp default blur');
      await renderer.act(async () => tree.unmount());
    }
  }

  // 9d. Numeric intensity bounds derive directly from tokens.liquidGlass with zero drift
  harness.setPlatform('android', 37);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);
    const palette = tokens.liquidGlass[scheme];
    for (const [intensity, expectedKey] of [
      [0, 'subtle'],
      [1, 'prominent'],
    ]) {
      function HarnessNumericTint() {
        const { targetRef, blurTargetRef, onTargetLayout } = useLiquidGlassBlurTarget();
        return React.createElement(
          'View',
          null,
          React.createElement(WiezLiquidGlassBackdrop, { targetRef, onLayout: onTargetLayout }),
          React.createElement(WiezLiquidGlass, {
            mode: 'lightweight',
            intensity,
            initialSize: { width: 80, height: 32 },
            testID: 'num-lw',
          }),
          React.createElement(WiezLiquidGlass, {
            mode: 'enhanced',
            intensity,
            blurTarget: blurTargetRef,
            initialSize: { width: 48, height: 48 },
            testID: 'num-enh',
          }),
        );
      }
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(React.createElement(HarnessNumericTint), { createNodeMock });
      });
      const json = tree.toJSON();
      const lwNode = collectNodes(json, (n) => n.props?.testID === 'num-lw')[0];
      const lwFill = collectNodes(
        lwNode,
        (n) =>
          n.type === 'View' &&
          typeof flattenStyle(n.props?.style).backgroundColor === 'string' &&
          flattenStyle(n.props?.style).backgroundColor.startsWith('rgba(') &&
          flattenStyle(n.props?.style).backgroundColor !== palette.pressedOverlay,
      )[0];
      assert.equal(
        parseRgbaAlpha(flattenStyle(lwFill.props.style).backgroundColor),
        palette.lightweightTintAlpha[expectedKey],
        `${scheme} lightweight numeric intensity=${intensity} must match ${expectedKey} token`,
      );
      const enhLens = collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView')[0];
      assert.equal(
        enhLens.props.tintAlpha,
        palette.tintAlpha[expectedKey],
        `${scheme} enhanced numeric intensity=${intensity} must match ${expectedKey} tintAlpha token`,
      );
      await renderer.act(async () => tree.unmount());
    }
  }

  console.log(
    'PASS test-liquid-glass-phase1: Material-system optical envelopes, v2 AGSL shader invariants, arbitrary shapes, Phase 2 API 31 RenderEffect / layout resize / token sync, Lab removal, and Catalog integration verified.',
  );
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
