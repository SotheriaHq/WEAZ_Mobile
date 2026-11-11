/**
 * Phase 3 Global Android Liquid Glass Integration Tests
 *
 * Verifies:
 * 1. Kotlin native backdrop/lens hardening & empty content-wrapper pruning
 * 2. Priority A static media surfaces (enhanced mode + backdrop sibling isolation)
 * 3. Priority B market/discovery/scrolling badges (lightweight dark-tinted overlays, zero BlurView)
 * 4. Priority C Runway SocialProofPill & Chip variant="nav" integration
 * 5. Priority D NativeIslandBottomNav (Android lightweight WiezLiquidGlass vs iOS USE_LIVE_BLUR)
 * 6. Priority E ProfileImageModal, SubscriptionNotice, AnimatedAuthBackground, Card liquidGlass
 * 7. Repo-wide zero-active-Android-BlurView audit & border/contrast preservation
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

global.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(__dirname, '..');

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style;
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

function createNodeMock(element) {
  if (!element || typeof element !== 'object') return {};
  return { _mockType: element.type };
}

function parseColorMock(input) {
  if (input === '#FFFFFF' || input === '#ffffff') return -1;
  if (input === '#141416') return -15461354;
  if (input === '#FAF5FF') return -330241;
  if (input === '#1A2230') return -15064528;
  return 0;
}

function createPhase3Harness(initialOS = 'android', initialVersion = 36) {
  const mockPlatform = { OS: initialOS, Version: initialVersion };
  let currentScheme = 'light';
  let nativeAvailable = true;
  let supportsRuntimeShader = true;
  let supportsRenderEffectBlur = true;
  const moduleCache = new Map();
  let nextHandle = 200;
  const handleMap = new WeakMap();
  const trackedEvents = [];

  let galleryStatusPayload = {
    collection: {
      id: 'col-1',
      title: 'Lagos Dusk Capsule',
      brandName: 'Maison Vant',
      coverImage: 'https://cdn.example/cover.jpg',
      coverImageId: null,
    },
    products: [
      {
        productId: 'prod-1',
        name: 'Adire Silk Kaftan',
        coverImage: 'https://cdn.example/prod1.jpg',
        coverImageId: null,
        media: [{ url: 'https://cdn.example/prod1.jpg', fileId: null }],
      },
    ],
  };

  const mockPressable = (props) => {
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
        const AnimatedValue = class {
          constructor(v) {
            this._value = v;
          }
          interpolate() {
            return 1;
          }
        };
        const noopAnim = { start: (cb) => cb && cb({ finished: true }), stop: () => undefined };
        return {
          Platform: mockPlatform,
          View: ViewWithRef,
          Modal: (props) =>
            props.visible ? React.createElement('Modal', props, props.children) : null,
          ScrollView: React.forwardRef((props, ref) =>
            React.createElement('ScrollView', { ...props, ref }, props.children),
          ),
          FlatList: React.forwardRef((props, ref) =>
            React.createElement(
              'FlatList',
              { ...props, ref },
              Array.isArray(props.data) && props.renderItem
                ? props.data.map((item, index) =>
                    React.createElement(
                      React.Fragment,
                      { key: props.keyExtractor ? props.keyExtractor(item, index) : String(index) },
                      props.renderItem({ item, index }),
                    ),
                  )
                : null,
            ),
          ),
          Pressable: mockPressable,
          Animated: {
            Value: AnimatedValue,
            View: ViewWithRef,
            Text: (props) => React.createElement('AnimatedText', props, props.children),
            timing: () => noopAnim,
            spring: () => noopAnim,
            loop: () => noopAnim,
            sequence: () => noopAnim,
            parallel: () => noopAnim,
          },
          Easing: {
            out: (fn) => fn,
            inOut: (fn) => fn,
            quad: (x) => x,
            ease: (x) => x,
          },
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
            return { supportsRuntimeShader, supportsRenderEffectBlur };
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
          isWiezLiquidGlassNativeAvailable: () => mockPlatform.OS === 'android' && nativeAvailable,
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
      if (request === 'expo-router') {
        return {
          router: {
            canGoBack: () => true,
            back: () => undefined,
            replace: () => undefined,
            push: () => undefined,
          },
        };
      }
      if (request === 'expo-status-bar') {
        return {
          StatusBar: (props) => React.createElement('StatusBar', props),
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
          SafeAreaView: (props) => React.createElement('SafeAreaView', props, props.children),
          useSafeAreaInsets: () => ({ top: 28, right: 0, bottom: 24, left: 0 }),
        };
      }
      if (request === 'react-native-reanimated') {
        const AnimatedMock = {
          __esModule: true,
          default: {
            View: ViewWithRef,
            Text: (props) => React.createElement('AnimatedText', props, props.children),
          },
          Easing: { out: (fn) => fn, cubic: (x) => x, quad: (x) => x },
          LinearTransition: { duration: () => ({}) },
          ZoomIn: { duration: () => ({}) },
          ZoomOut: { duration: () => ({}) },
          interpolateColor: (_val, _range, colors) => colors[0],
          useAnimatedStyle: (fn) => fn(),
          useSharedValue: (v) => ({ value: v }),
          withSpring: (v) => v,
          withTiming: (v) => v,
        };
        return AnimatedMock;
      }
      if (request === 'react-native-worklets') {
        return { scheduleOnRN: (fn, ...args) => fn(...args) };
      }
      if (request === 'react-native-gesture-handler') {
        const mockGesture = () => ({});
        return {
          GestureDetector: ({ children }) => children,
          useCompetingGestures: mockGesture,
          useLongPressGesture: mockGesture,
          useTapGesture: mockGesture,
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
      if (request === '@/src/system/ScreenChrome') {
        return {
          NATIVE_ISLAND_NAV: {
            height: 56,
            radius: 28,
            horizontalPadding: 4,
          },
          getNativeIslandContentClearance: () => 96,
          getNativeIslandLayout: () => ({
            bottomOffset: 16,
            sideOffset: 16,
            islandWidth: 380,
          }),
          useScreenChrome: () => ({
            windowWidth: 412,
            insets: { top: 28, right: 0, bottom: 24, left: 0 },
            immersiveOverlayBottomClearance: 108,
            islandLayout: { bottomOffset: 16, sideOffset: 16, islandWidth: 380 },
          }),
        };
      }
      if (request === '@/src/system/AndroidSystemBars') {
        return { useAndroidOverlaySystemBars: () => undefined };
      }
      if (request === '@/src/perf/commitCost') {
        return {
          measurePressHandler: (fn) => fn(),
          useCommitCost: () => undefined,
        };
      }
      if (request === '@/src/perf/wiezPerf') {
        return {
          perfRecordTouchQueue: () => undefined,
          perfTouchQueueMs: () => 0,
        };
      }
      if (request === '@/src/utils/navPerf') {
        return {
          navPerf: {
            tapPressIn: () => undefined,
            optimisticActiveSet: () => undefined,
            tap: () => undefined,
            pressedFeedbackVisible: () => undefined,
            activeIndicatorIntent: () => undefined,
            activeIndicatorVisible: () => undefined,
            mark: () => undefined,
          },
        };
      }
      if (request === '@/src/analytics/mobileAnalytics') {
        return {
          trackMobileEvent: (name, payload) => {
            trackedEvents.push({ name, payload });
          },
        };
      }
      if (request === '@/src/utils/mobileNavigation') {
        return { drillDownPush: () => undefined, topLevelNavigate: () => undefined };
      }
      if (request === '@/src/api/StoreApi') {
        return {
          MobileStoreApi: {
            getCollectionBagStatus: async () => galleryStatusPayload,
          },
        };
      }
      if (request === '@/src/features/feed/utils/feedDiagnostics') {
        return { isWiezDebugEnabled: () => false };
      }
      if (request === '@/components/ui/AppText') {
        return { AppText: (props) => React.createElement('AppText', props, props.children) };
      }
      if (request === '@/components/ui/Button') {
        return { Button: (props) => React.createElement('Button', props, props.children) };
      }
      if (request === '@/components/ui/InlineNavLink') {
        return { BackLink: (props) => React.createElement('BackLink', props) };
      }
      if (request === '@/components/ui/QuickPressable') {
        return { QuickPressable: mockPressable };
      }
      if (request === '@/components/ui/MediaScrim') {
        return { MediaScrim: (props) => React.createElement('MediaScrim', props) };
      }
      if (request === '@/components/ui/NewDropBadge') {
        return { NewDropBadge: (props) => React.createElement('NewDropBadge', props) };
      }
      if (request === '@/components/ui/Skeleton') {
        return {
          Skeleton: (props) => React.createElement('Skeleton', props),
          SkeletonAvatar: (props) => React.createElement('SkeletonAvatar', props),
          SkeletonText: (props) => React.createElement('SkeletonText', props),
        };
      }
      if (request === '@/components/ui/StableImage') {
        return { StableImage: (props) => React.createElement('StableImage', props) };
      }
      if (request === '@/components/ui/PlatformMark') {
        return { ContactMarker: (props) => React.createElement('ContactMarker', props) };
      }
      if (request === '@/components/catalog/ProfileBadge') {
        return { BrandBadgeRail: (props) => React.createElement('BrandBadgeRail', props) };
      }
      if (request === '@/components/ui/VerifiedSeal') {
        return {
          SEAL_HEADER_SIZE: 20,
          StoreStatusSeal: (props) => React.createElement('StoreStatusSeal', props),
        };
      }
      if (request === '@/components/commerce/BagItButton') {
        return { BagItButton: (props) => React.createElement('BagItButton', props) };
      }
      if (request === '@/components/ui/MuseLoader') {
        return { MuseLoader: (props) => React.createElement('MuseLoader', props) };
      }
      if (request === '@/src/hooks/useResolvedImageUri') {
        return { useResolvedImageUri: ({ src }) => src ?? null };
      }
      if (request === '@/src/toast/ToastContext') {
        return { useToast: () => ({ info: () => undefined, error: () => undefined }) };
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

      throw new Error(`Unhandled module import in Phase 3 test harness: ${request} (from ${resolved})`);
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
    setGalleryStatus: (payload) => {
      galleryStatusPayload = payload;
    },
    trackedEvents,
    loadTs: (relativePath) => loadTs(path.join(ROOT, relativePath)),
  };
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function runTests() {
  // ── 1. Batch 0 Kotlin Hardening & Empty Content Wrapper ──────────────────
  const backdropKt = readSource(
    'modules/wiez-liquid-glass/android/src/main/java/expo/modules/wiezliquidglass/WiezLiquidGlassBackdropView.kt',
  );
  const lensKt = readSource(
    'modules/wiez-liquid-glass/android/src/main/java/expo/modules/wiezliquidglass/WiezLiquidGlassLensView.kt',
  );
  assert.match(
    backdropKt,
    /ArrayList<WiezLiquidGlassLensView>\(registeredLenses\.size\)/,
    'Backdrop notify loop must snapshot registeredLenses to prevent ConcurrentModificationException',
  );
  assert.match(
    backdropKt,
    /iterator\.remove\(\)/,
    'Backdrop notify loop must prune stale cleared WeakReferences',
  );
  assert.match(
    lensKt,
    /private fun isViewAncestorOrSelf\(candidate: View, child: View\)/,
    'Lens view must explicitly reject self or ancestor targets to avoid recursive capture',
  );
  assert.match(
    lensKt,
    /observedTreeObserverRef/,
    'Lens view must track observed ViewTreeObserver for clean PreDrawListener removal',
  );
  assert.match(lensKt, /private var refractionStrength: Float = 1\.02f/);
  assert.match(lensKt, /private var curvature: Float = 0\.66f/);
  assert.match(lensKt, /private var opticalThickness: Float = 0\.55f/);
  assert.match(lensKt, /private var chromaticAberration: Float = 0f/);
  assert.match(lensKt, /private var blurRadiusDp: Float = 0f/);

  const harness = createPhase3Harness('android', 36);
  const { tokens } = harness.loadTs('src/styles/tokens.ts');
  const { WiezLiquidGlass } = harness.loadTs('components/ui/WiezLiquidGlass.tsx');
  const { BrandProfileHeader } = harness.loadTs('components/catalog/BrandProfileHeader.tsx');
  const { ProfileHeader } = harness.loadTs('components/catalog/ProfileHeader.tsx');
  const { CollectionGalleryViewer } = harness.loadTs(
    'src/features/market/components/CollectionGalleryViewer.tsx',
  );
  const { UnifiedProductCard } = harness.loadTs('components/commerce/UnifiedProductCard.tsx');
  const { CollectionShelfCard } = harness.loadTs('src/features/market/components/MarketEntityCards.tsx');
  const { SocialProofPill } = harness.loadTs('components/ui/SocialProofPill.tsx');
  const { Chip } = harness.loadTs('components/ui/Chip.tsx');
  const { NativeIslandBottomNav } = harness.loadTs('components/navigation/NativeIslandBottomNav.tsx');
  const { ProfileImageModal } = harness.loadTs('components/profile/ProfileImageModal.tsx');
  const { Card } = harness.loadTs('components/ui/Card.tsx');

  // Empty content plate skips unnecessary inner content View
  {
    let emptyTree;
    let nonEmptyTree;
    await renderer.act(async () => {
      emptyTree = renderer.create(
        React.createElement(WiezLiquidGlass, {
          mode: 'lightweight',
          borderRadius: tokens.radius.full,
          initialSize: { width: 120, height: 32 },
        }),
        { createNodeMock },
      );
      nonEmptyTree = renderer.create(
        React.createElement(
          WiezLiquidGlass,
          {
            mode: 'lightweight',
            borderRadius: tokens.radius.full,
            initialSize: { width: 120, height: 32 },
          },
          React.createElement('Label', null, 'Pill'),
        ),
        { createNodeMock },
      );
    });
    const emptyJson = emptyTree.toJSON();
    const nonEmptyJson = nonEmptyTree.toJSON();
    assert.equal(
      collectNodes(
        emptyJson,
        (n) => n.type === 'View' && flattenStyle(n.props?.style).zIndex === 1,
      ).length,
      0,
      'WiezLiquidGlass must omit empty content wrapper when children are absent',
    );
    const nonEmptyWrappers = collectNodes(
      nonEmptyJson,
      (n) => n.type === 'View' && flattenStyle(n.props?.style).zIndex === 1,
    );
    assert.equal(
      nonEmptyWrappers.length,
      1,
      'WiezLiquidGlass must retain content wrapper when children are present',
    );
    assert.equal(
      collectNodes(nonEmptyWrappers[0], (n) => n.type === 'Label').length,
      1,
      'WiezLiquidGlass content wrapper must contain foreground children',
    );
    await renderer.act(async () => {
      emptyTree.unmount();
      nonEmptyTree.unmount();
    });
  }

  // ── 2. Priority A: Static Media Surfaces (Light & Dark, Android API 36) ──
  harness.setPlatform('android', 36);
  harness.setNativeCaps({ available: true, runtimeShader: true, renderEffectBlur: true });

  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);

    // 2a. BrandProfileHeader + Edit banner square lens
    {
      let editCount = 0;
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(BrandProfileHeader, {
            brandName: 'Maison Vant',
            bannerUrl: 'https://cdn.example/banner.jpg',
            isOwner: true,
            onBack: () => undefined,
            onNotifications: () => undefined,
            onOpenMenu: () => undefined,
            onEditBanner: () => {
              editCount += 1;
            },
          }),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      const backdrop = collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView')[0];
      assert.ok(backdrop, `BrandProfileHeader must mount backdrop in ${scheme}`);
      assert.equal(
        collectNodes(backdrop, (n) => n.type === 'WiezLiquidGlassLensView' || n.type === 'Pressable').length,
        0,
        'Interactive controls and lenses must stay outside WiezLiquidGlassBackdropView',
      );
      const editBtn = collectNodes(
        json,
        (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Edit banner',
      )[0];
      assert.ok(editBtn);
      assert.equal(flattenStyle(editBtn.props.style).borderWidth, 0);
      assert.equal(collectNodes(editBtn, (n) => n.type === 'WiezLiquidGlassLensView').length, 1);
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      await renderer.act(async () => editBtn.props.onPress());
      assert.equal(editCount, 1);
      await renderer.act(async () => tree.unmount());
    }

    // 2b. ProfileHeader hero back control (both image banner and BannerFallback)
    for (const hasBanner of [true, false]) {
      let backCount = 0;
      let editBannerCount = 0;
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(ProfileHeader, {
            brandName: 'Atelier K',
            bannerUrl: hasBanner ? 'https://cdn.example/banner.jpg' : null,
            isOwner: true,
            onBack: () => {
              backCount += 1;
            },
            onEditBanner: () => {
              editBannerCount += 1;
            },
          }),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      const backdrop = collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView')[0];
      assert.ok(backdrop);
      assert.equal(
        collectNodes(backdrop, (n) => n.type === 'WiezLiquidGlassLensView').length,
        0,
        'ProfileHeader hero lens must stay outside WiezLiquidGlassBackdropView',
      );
      const goBack = collectNodes(
        json,
        (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Go back',
      )[0];
      assert.ok(goBack);
      assert.equal(flattenStyle(goBack.props.style).borderWidth, 0);
      assert.equal(collectNodes(goBack, (n) => n.type === 'WiezLiquidGlassLensView').length, 1);
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      await renderer.act(async () => goBack.props.onPress());
      assert.equal(backCount, 1);

      if (!hasBanner) {
        const fallbackBtn = collectNodes(
          json,
          (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Edit banner',
        )[0];
        assert.ok(fallbackBtn);
        await renderer.act(async () => fallbackBtn.props.onPress());
        assert.equal(editBannerCount, 1);
      }
      await renderer.act(async () => tree.unmount());
    }

    // 2c. CollectionGalleryViewer backdrop + back button + slide counter pill
    {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(CollectionGalleryViewer, { collectionId: 'col-1' }),
          { createNodeMock },
        );
      });
      await renderer.act(async () => Promise.resolve());
      const json = tree.toJSON();
      const backdrop = collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView')[0];
      assert.ok(backdrop, `CollectionGalleryViewer must mount backdrop in ${scheme}`);
      assert.equal(
        collectNodes(backdrop, (n) => n.type === 'WiezLiquidGlassLensView' || n.type === 'Pressable').length,
        0,
      );
      const backBtn = collectNodes(
        json,
        (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Back to collection',
      )[0];
      assert.ok(backBtn);
      assert.equal(flattenStyle(backBtn.props.style).borderWidth, 0);
      assert.equal(
        collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length,
        2,
        'CollectionGalleryViewer must mount 2 hardware lenses (back button + count pill)',
      );
      const counterText = collectNodes(
        json,
        (n) => n.type === 'AppText' && Array.isArray(n.children) && n.children.includes(' / '),
      )[0];
      assert.ok(counterText);
      assert.equal(counterText.props.tone, 'inverse', 'Gallery counter pill must use inverse text contrast');
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      await renderer.act(async () => tree.unmount());
    }
  }

  // ── 3. Priority B: Market, Discovery & Scrolling Badges ──────────────────
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);

    // 3a. UnifiedProductCard: unclipped glass vs clipped primary disc
    {
      let cardPressed = 0;
      let favPressed = 0;
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(
            'View',
            null,
            React.createElement(UnifiedProductCard, {
              width: 180,
              title: 'Silk Slip Dress',
              priceLabel: '$120',
              mediaSrc: 'https://cdn.example/p1.jpg',
              favorite: false,
              onPress: () => {
                cardPressed += 1;
              },
              onFavoritePress: () => {
                favPressed += 1;
              },
            }),
            React.createElement(UnifiedProductCard, {
              width: 180,
              title: 'Silk Slip Dress (Clipped)',
              priceLabel: '$120',
              mediaSrc: 'https://cdn.example/p2.jpg',
              favorite: true,
              onPress: () => undefined,
              onFavoritePress: () => undefined,
            }),
          ),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView').length, 0);

      const pressables = collectNodes(json, (n) => n.type === 'Pressable');
      const unclippedBtn = pressables.find((n) => n.props?.accessibilityLabel === 'Clip this');
      const clippedBtn = pressables.find((n) => n.props?.accessibilityLabel === 'Remove from your clips');
      assert.ok(unclippedBtn && clippedBtn);
      assert.equal(flattenStyle(unclippedBtn.props.style).borderWidth, 0);
      assert.equal(collectNodes(unclippedBtn, (n) => n.type === 'Svg').length, 1);
      assert.equal(
        flattenStyle(clippedBtn.props.style).backgroundColor,
        tokens.themes[scheme].colors.primary,
      );
      assert.equal(collectNodes(clippedBtn, (n) => n.type === 'Svg').length, 0);

      let stopped = false;
      await renderer.act(async () => {
        unclippedBtn.props.onPress({ stopPropagation: () => { stopped = true; } });
      });
      assert.equal(stopped, true);
      assert.equal(favPressed, 1);
      assert.equal(cardPressed, 0);
      await renderer.act(async () => tree.unmount());
    }

    // 3b. CollectionShelfCard piecesPill uses lightweight dark glass without BlurView/lenses
    {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(CollectionShelfCard, {
            width: 320,
            title: 'Evening Edit',
            facts: 'Atelier · 6 pieces',
            piecesLabel: '6 pieces',
            covers: [{ src: 'https://cdn.example/c1.jpg' }],
            onPress: () => undefined,
          }),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'Svg').length, 1);
      await renderer.act(async () => tree.unmount());
    }
  }

  // ── 4. Priority C: Runway SocialProofPill & Nav Chip ─────────────────────
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);

    // 4a. SocialProofPill
    {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(
            'View',
            null,
            React.createElement(SocialProofPill, {
              itemId: 'item-1',
              threadCount: 18,
              sourceScreen: 'runway_feed',
            }),
            React.createElement(SocialProofPill, {
              itemId: 'item-2',
              threadCount: 2,
              sourceScreen: 'runway_feed',
            }),
          ),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      assert.equal(collectNodes(json, (n) => n.type === 'Svg').length, 1);
      assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      const pillText = collectNodes(json, (n) => n.type === 'AppText')[0];
      assert.equal(pillText.props.numberOfLines, undefined, 'SocialProofPill text must not truncate');
      await renderer.act(async () => tree.unmount());
    }

    // 4b. Chip variant="nav" (standard & onDarkStage) vs OptionChip
    for (const onDarkStage of [false, true]) {
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(
            'View',
            null,
            React.createElement(Chip, {
              label: 'Discover',
              variant: 'nav',
              selected: true,
              onDarkStage,
              onPress: () => undefined,
            }),
            React.createElement(Chip, {
              label: 'Explore',
              variant: 'nav',
              selected: false,
              onDarkStage,
              onPress: () => undefined,
            }),
            React.createElement(Chip, {
              label: 'Casual',
              variant: 'default',
              selected: true,
              onPress: () => undefined,
            }),
          ),
          { createNodeMock },
        );
      });
      const json = tree.toJSON();
      const buttons = collectNodes(json, (n) => n.type === 'Pressable');
      const selectedNav = buttons[0];
      const unselectedNav = buttons[1];
      const optionChip = buttons[2];

      assert.equal(flattenStyle(selectedNav.props.style).backgroundColor, 'transparent');
      assert.equal(flattenStyle(selectedNav.props.style).borderWidth, 0);
      assert.ok(
        collectNodes(selectedNav, (n) => n.type === 'ExpoLinearGradient').length >= 1,
        'Selected nav Chip must mount lightweight Liquid Glass depth/reflection gradients',
      );
      assert.equal(collectNodes(unselectedNav, (n) => n.type === 'ExpoLinearGradient').length, 0);
      assert.equal(collectNodes(unselectedNav, (n) => n.type === 'Svg').length, 0);
      assert.equal(collectNodes(optionChip, (n) => n.type === 'ExpoLinearGradient').length, 0);
      assert.equal(collectNodes(optionChip, (n) => n.type === 'Svg').length, 0);
      const selectedNavGlassRoot = collectNodes(
        selectedNav,
        (n) => n.type === 'View' && typeof n.props?.onLayout === 'function',
      )[0];
      assert.ok(selectedNavGlassRoot, 'Selected nav Chip must attach WiezLiquidGlass layout measurer');
      await renderer.act(async () => {
        selectedNavGlassRoot.props.onLayout({
          nativeEvent: { layout: { width: 92, height: 34 } },
        });
      });
      const updatedSelectedNav = collectNodes(tree.toJSON(), (n) => n.type === 'Pressable')[0];
      assert.equal(collectNodes(updatedSelectedNav, (n) => n.type === 'Svg').length, 1);
      assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
      assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
      await renderer.act(async () => tree.unmount());
    }
  }

  // ── 5. Priority D: NativeIslandBottomNav (Android vs iOS platform gates) ─
  const navItems = [
    { key: 'runway', label: 'Runway', emoji: '✨', active: true },
    { key: 'market', label: 'Market', emoji: '🛍️', active: false },
  ];

  // Android runtime harness
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);
    let selectedKey = null;
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(NativeIslandBottomNav, {
          items: navItems,
          onSelect: (item) => {
            selectedKey = item.key;
          },
        }),
        { createNodeMock },
      );
    });
    const json = tree.toJSON();
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 0);
    assert.equal(
      collectNodes(json, (n) => n.type === 'ExpoLinearGradient').length,
      2,
      'Android IslandGlass must use lightweight WiezLiquidGlass depth + reflection gradients (no separate legacy sheen)',
    );
    assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassBackdropView').length, 0);
    assert.equal(collectNodes(json, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
    const svg = collectNodes(json, (n) => n.type === 'Svg')[0];
    assert.ok(svg, `Android IslandGlass must mount lightweight specular SVG in ${scheme}`);
    assert.equal(svg.props.width, 380);
    assert.equal(svg.props.height, 56);

    const marketTab = collectNodes(
      json,
      (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Market',
    )[0];
    await renderer.act(async () => marketTab.props.onPress());
    assert.equal(selectedKey, 'market');
    await renderer.act(async () => tree.unmount());
  }

  // Fresh iOS runtime harness verifies USE_LIVE_BLUR = true still mounts BlurView on iOS
  {
    const iosHarness = createPhase3Harness('ios', '18.0');
    iosHarness.setScheme('dark');
    const { NativeIslandBottomNav: IosIslandNav } = iosHarness.loadTs(
      'components/navigation/NativeIslandBottomNav.tsx',
    );
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(IosIslandNav, {
          items: navItems,
          onSelect: () => undefined,
        }),
        { createNodeMock },
      );
    });
    const json = tree.toJSON();
    assert.equal(collectNodes(json, (n) => n.type === 'BlurView').length, 1);
    assert.equal(collectNodes(json, (n) => n.type === 'Svg').length, 0);
    await renderer.act(async () => tree.unmount());
  }

  // ── 6. Priority E: Modals, Card liquidGlass & Dead Import Cleanups ───────
  for (const scheme of ['light', 'dark']) {
    harness.setScheme(scheme);

    // 6a. ProfileImageModal
    {
      let closed = 0;
      let tree;
      await renderer.act(async () => {
        tree = renderer.create(
          React.createElement(ProfileImageModal, {
            visible: true,
            imageUrl: 'https://cdn.example/avatar.jpg',
            onClose: () => {
              closed += 1;
            },
          }),
          { createNodeMock },
        );
      });
      const jsonBeforeLayout = tree.toJSON();
      assert.equal(collectNodes(jsonBeforeLayout, (n) => n.type === 'BlurView').length, 0);
      assert.equal(
        collectNodes(jsonBeforeLayout, (n) => n.type === 'Svg').length,
        1,
        'ProfileImageModal closeButton (fixed initialSize) must immediately mount lightweight specular rim',
      );
      const panelGlassView = collectNodes(
        jsonBeforeLayout,
        (n) =>
          n.type === 'View' &&
          typeof n.props?.onLayout === 'function' &&
          flattenStyle(n.props?.style).borderRadius === 24,
      )[0];
      assert.ok(panelGlassView, 'ProfileImageModal panel must mount WiezLiquidGlass root view');
      await renderer.act(async () => {
        panelGlassView.props.onLayout({
          nativeEvent: { layout: { width: 380, height: 620 } },
        });
      });
      const json = tree.toJSON();
      assert.equal(
        collectNodes(json, (n) => n.type === 'Svg').length,
        2,
        'ProfileImageModal must render lightweight liquid glass SVG rims for both panel and close button after layout',
      );
      const closeBtn = collectNodes(
        json,
        (n) => n.type === 'Pressable' && n.props?.accessibilityLabel === 'Close profile image',
      )[0];
      assert.ok(closeBtn);
      assert.equal(flattenStyle(closeBtn.props.style).borderWidth, 0);
      await renderer.act(async () => closeBtn.props.onPress());
      assert.equal(closed, 1);
      await renderer.act(async () => tree.unmount());
    }

    // 6b. Card variant="liquidGlass" on Android vs iOS
    {
      harness.setPlatform('android', 36);
      let androidTree;
      await renderer.act(async () => {
        androidTree = renderer.create(
          React.createElement(
            Card,
            { variant: 'liquidGlass', onPress: () => undefined, testID: 'lg-card' },
            React.createElement('CardChild', null, 'Plan details'),
          ),
          { createNodeMock },
        );
      });
      const androidInitialJson = androidTree.toJSON();
      assert.equal(flattenStyle(androidInitialJson.props.style).backgroundColor, 'transparent');
      assert.equal(flattenStyle(androidInitialJson.props.style).borderWidth, 0);
      assert.equal(flattenStyle(androidInitialJson.props.style).elevation, 0);
      assert.equal(flattenStyle(androidInitialJson.props.style).overflow, 'hidden');
      assert.equal(collectNodes(androidInitialJson, (n) => n.type === 'WiezLiquidGlassLensView').length, 0);
      assert.equal(collectNodes(androidInitialJson, (n) => n.type === 'BlurView').length, 0);
      assert.ok(
        collectNodes(androidInitialJson, (n) => n.type === 'ExpoLinearGradient').length >= 1,
        'Card liquidGlass must render lightweight Liquid Glass transmission/depth gradients',
      );
      const cardGlassRoot = collectNodes(
        androidInitialJson,
        (n) => n.type === 'View' && typeof n.props?.onLayout === 'function',
      )[0];
      assert.ok(cardGlassRoot, 'Card liquidGlass must attach WiezLiquidGlass onLayout measurer');
      await renderer.act(async () => {
        cardGlassRoot.props.onLayout({
          nativeEvent: { layout: { width: 320, height: 140 } },
        });
      });
      const androidJson = androidTree.toJSON();
      const cardSvg = collectNodes(androidJson, (n) => n.type === 'Svg')[0];
      assert.ok(cardSvg, 'Card liquidGlass must mount SVG rim once laid out');
      assert.equal(cardSvg.props.width, 320);
      assert.equal(cardSvg.props.height, 140);
      await renderer.act(async () => androidTree.unmount());
    }
  }

  // ── 7. Repo-Wide Android BlurView Audit & Source Migration Contracts ───────
  function walkSourceFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walkSourceFiles(fullPath, out);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        out.push(fullPath);
      }
    }
    return out;
  }

  const allowedBlurFiles = new Set([
    'components/ui/WiezLiquidGlass.tsx',
    'components/navigation/NativeIslandBottomNav.tsx',
  ]);
  for (const dirName of ['app', 'components', 'src']) {
    for (const fullPath of walkSourceFiles(path.join(ROOT, dirName))) {
      const rel = path.relative(ROOT, fullPath).split(path.sep).join('/');
      if (allowedBlurFiles.has(rel)) continue;
      const src = fs.readFileSync(fullPath, 'utf8');
      assert.doesNotMatch(
        src,
        /from\s+['"]expo-blur['"]|<\s*BlurView\b/,
        `Migrated app source ${rel} must not import or render BlurView outside platform-gated iOS paths`,
      );
    }
  }

  const marketScreenSrc = readSource('src/features/market/components/MarketScreen.tsx');
  assert.match(marketScreenSrc, /heroPill:\s*\{[\s\S]*borderWidth:\s*0/);
  assert.match(marketScreenSrc, /<WiezLiquidGlass[\s\S]*style=\{styles\.heroPill\}/);

  const suggestionSrc = readSource('src/features/market/components/MobileMarketSuggestionBlocks.tsx');
  assert.match(suggestionSrc, /kindBadge:\s*\{[\s\S]*borderWidth:\s*0/);
  assert.match(suggestionSrc, /<WiezLiquidGlass[\s\S]*style=\{styles\.kindBadge\}/);

  const collectionCardSrc = readSource('components/catalog/CollectionCard.tsx');
  assert.doesNotMatch(collectionCardSrc, /function RailButton\b/);
  assert.match(collectionCardSrc, /onSave\?:\s*\(/);
  assert.match(collectionCardSrc, /onShare\?:\s*\(/);

  const commerceViewerSrc = readSource('src/features/market/components/MarketCommerceViewer.tsx');
  assert.match(commerceViewerSrc, /sheetSurface:\s*\{[\s\S]*borderWidth:\s*0/);
  assert.match(commerceViewerSrc, /inBagPill:\s*\{[\s\S]*borderWidth:\s*0/);
  assert.match(commerceViewerSrc, /<WiezLiquidGlass[\s\S]*style=\{\[styles\.inBagPill/);
  assert.doesNotMatch(
    commerceViewerSrc,
    /style=\{\[styles\.inBagPill[\s\S]{0,300}numberOfLines/,
  );

  const subNoticeSrc = readSource('components/subscriptions/SubscriptionNotice.tsx');
  assert.match(subNoticeSrc, /<WiezLiquidGlass[\s\S]*borderRadius=\{16\}/);
  assert.match(subNoticeSrc, /backgroundColor:\s*theme\.colors\.surfaceCard/);

  console.log(
    `PASS test-liquid-glass-phase3: All Priority A-E integrations, Android API 36 / iOS parity, Kotlin lifecycle hardening, Card liquidGlass, and repo-wide BlurView removal verified (${harness.trackedEvents.length} analytics event(s) exercised).`,
  );
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
