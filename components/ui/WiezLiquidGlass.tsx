import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  findNodeHandle,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  getWiezLiquidGlassBackdropNativeView,
  getWiezLiquidGlassDiagnostics,
  getWiezLiquidGlassLensNativeView,
  isWiezLiquidGlassNativeAvailable,
  supportsWiezLiquidGlassRenderEffectBlur,
  supportsWiezLiquidGlassRefraction,
  toAndroidColorInt,
} from '@/modules/wiez-liquid-glass/src';
import { tokens, type ThemeScheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const ANDROID_HARDWARE_BLUR_MIN_API = 31;
const ANDROID_AGSL_REFRACTION_MIN_API = 33;

// Confine the static reflection highlight to a tight top-left outer crescent
// so the central core of the glass lens remains clear and unobstructed.
const REFLECTION_START = { x: 0.04, y: 0.0 } as const;
const REFLECTION_END = { x: 0.62, y: 0.62 } as const;
const REFLECTION_LOCATIONS = [0, 0.14, 0.34] as const;

const DEPTH_START = { x: 0.5, y: 0.0 } as const;
const DEPTH_END = { x: 0.5, y: 1.0 } as const;
const DEPTH_LOCATIONS = [0, 0.25, 0.72, 1] as const;

const DEFAULT_CURVATURE = tokens.liquidGlass.optics.curvature;
const DEFAULT_OPTICAL_THICKNESS = tokens.liquidGlass.optics.opticalThickness;
const DEFAULT_CHROMA = tokens.liquidGlass.optics.chromaticAberration;

export type WiezLiquidGlassMode = 'lightweight' | 'enhanced';
export type WiezLiquidGlassIntensityPreset = 'subtle' | 'regular' | 'prominent';
export type WiezLiquidGlassIntensity = WiezLiquidGlassIntensityPreset | number;
export type WiezLiquidGlassTintMode = 'auto' | ThemeScheme;

export type WiezLiquidGlassSize = {
  width: number;
  height: number;
};

export type WiezLiquidGlassProps = AccessibilityProps & {
  children?: React.ReactNode;
  /**
   * Optical rendering path:
   * - `lightweight`: multi-layer sheer translucency, hairline directional SVG specular rim,
   *   and outer-corner specular highlight with zero native backdrop capture pass. Preferred
   *   for scrolling `FlatList` rows, multi-card grids, live video (`SurfaceView`), `WebView`
   *   containers, and cross-window Android `Modal` overlays.
   * - `enhanced`: uses the hardware Android `RenderNode` + `RenderEffect` + API 33+ AGSL
   *   optical refraction pipeline when `blurTarget` points to a sibling
   *   `WiezLiquidGlassBackdrop` (no Dimezis stipple or opaque grey fills); falls back cleanly
   *   to API 31–32 `RenderEffect` blur or `lightweight` on older APIs, missing targets, or iOS.
   */
  mode?: WiezLiquidGlassMode;
  /** Visual density preset (`subtle` | `regular` | `prominent`) or normalized scalar `0..1`. */
  intensity?: WiezLiquidGlassIntensity;
  /** Corner radius in logical pixels. Defaults to circular/pill radius (`tokens.radius.full`). */
  borderRadius?: number;
  /** Specular rim and directional highlight intensity (`0..1.5`), or `false` to disable highlights. */
  highlightIntensity?: number | false;
  /** Follow active WIEZ theme (`auto`) or lock to `light` / `dark` optical tuning. */
  tintMode?: WiezLiquidGlassTintMode;
  /**
   * Enables geometric convex meniscus refraction on supported hardware (Android API 33+ AGSL
   * in `enhanced` mode). Defaults to `true`.
   */
  refraction?: boolean;
  /** Override displacement amplitude scalar (`0..2`). Defaults from `intensity`. */
  refractionStrength?: number;
  /** Override meniscus shoulder dome curve (`0..1`: crisp lip -> curved dome). Defaults to `0.66`. */
  curvature?: number;
  /** Override optical bezel thickness/reach (`0..1`). Defaults to `0.55`. */
  opticalThickness?: number;
  /** Override optional Gaussian scatter blur radius in dp (`0..24`). Defaults to `0` on AGSL and token-derived blur on API 31–32 `RenderEffect`. */
  blurRadius?: number;
  /** Override Fresnel edge lighting intensity (`0..1.5`). Defaults to `highlightIntensity`. */
  fresnelIntensity?: number;
  /** Override specular shoulder reflection intensity (`0..1.5`). Defaults to `highlightIntensity`. */
  reflectionIntensity?: number;
  /** Override sheer optical tint alpha (`0..0.6`). Defaults to theme crystal-sheer token. */
  tintAlpha?: number;
  /** Optional chromatic dispersion (`0..1`). Defaults to `0` (disabled). */
  chromaticAberration?: number;
  /** Sibling backdrop ref paired with `WiezLiquidGlassBackdrop` via `useLiquidGlassBlurTarget()` on Android. Never attach to an ancestor containing this lens. */
  blurTarget?: React.RefObject<View | null>;
  /** Initial control dimensions used to paint curved rim geometry before async layout completes. */
  initialSize?: WiezLiquidGlassSize;
  /** Optional pressed state illumination without heavy opaque fill shifts. */
  pressed?: boolean;
  /** Optional touch behavior for decorative/non-interactive glass badges or pills. */
  pointerEvents?: ViewProps['pointerEvents'];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export type WiezLiquidGlassBackdropProps = ViewProps & {
  targetRef: React.RefObject<View | null>;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getAndroidApiLevel(): number | null {
  if (Platform.OS !== 'android') return null;
  if (typeof Platform.Version === 'number') {
    return Number.isFinite(Platform.Version) ? Platform.Version : null;
  }
  const parsed = Number.parseInt(String(Platform.Version), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function supportsEnhancedLiquidGlass(): boolean {
  if (Platform.OS === 'ios') return true;
  const apiLevel = getAndroidApiLevel();
  return apiLevel !== null && apiLevel >= ANDROID_HARDWARE_BLUR_MIN_API;
}

export function supportsNativeLiquidGlassRefraction(): boolean {
  if (Platform.OS !== 'android') return false;
  const apiLevel = getAndroidApiLevel();
  if (apiLevel === null || apiLevel < ANDROID_AGSL_REFRACTION_MIN_API) return false;
  return supportsWiezLiquidGlassRefraction();
}

export function getLiquidGlassCapabilities() {
  const apiLevel = getAndroidApiLevel();
  const diagnostics = getWiezLiquidGlassDiagnostics();
  return {
    platform: Platform.OS,
    apiLevel,
    enhancedSupported: supportsEnhancedLiquidGlass(),
    agslRefractionSupported: supportsNativeLiquidGlassRefraction(),
    ...diagnostics,
  };
}

/**
 * Synchronizes a target View ref as an immutable ref-object snapshot once mounted.
 *
 * Exposing a fresh snapshot upon target attachment ensures sibling glass lenses
 * resolve the native view handle deterministically on the initial synchronous commit
 * pass without mounting stale opaque fallback frames.
 *
 * Pair `{ targetRef, onTargetLayout }` with `<WiezLiquidGlassBackdrop>` and pass
 * `blurTargetRef` to sibling `<WiezLiquidGlass mode="enhanced" />` instances only.
 * Do not attach `targetRef` to an ancestor containing `WiezLiquidGlass` children.
 */
export function useLiquidGlassBlurTarget() {
  const targetRef = React.useRef<View | null>(null);
  const [attachedTarget, setAttachedTarget] = React.useState<View | null>(null);

  const syncTarget = React.useCallback(() => {
    const node = targetRef.current;
    setAttachedTarget((current) => (current === node ? current : node));
  }, []);

  React.useLayoutEffect(() => {
    syncTarget();
    return () => {
      setAttachedTarget(null);
    };
  }, [syncTarget]);

  const blurTargetRef = React.useMemo<React.RefObject<View | null>>(
    () => ({ current: attachedTarget }),
    [attachedTarget],
  );

  return {
    targetRef,
    blurTargetRef,
    onTargetLayout: syncTarget,
  };
}

/**
 * Wraps background media behind Android Liquid Glass controls so native optical
 * lenses sample underlying pixels cleanly without capturing interactive glass chrome.
 *
 * Must be rendered as a **sibling** behind floating controls (never wrap a
 * `WiezLiquidGlass mode="enhanced"` lens inside `WiezLiquidGlassBackdrop`). Avoid
 * placing live `Video` (`SurfaceView`), Chromium `WebView`, or fast-scrolling `FlatList`
 * cards inside `WiezLiquidGlassBackdrop`; those surfaces should pair with
 * `mode="lightweight"` controls on Android.
 */
export const WiezLiquidGlassBackdrop = React.memo(function WiezLiquidGlassBackdrop({
  targetRef,
  collapsable = false,
  children,
  ...rest
}: WiezLiquidGlassBackdropProps) {
  const NativeBackdrop =
    Platform.OS === 'android' &&
    supportsEnhancedLiquidGlass() &&
    isWiezLiquidGlassNativeAvailable()
      ? getWiezLiquidGlassBackdropNativeView()
      : null;

  if (NativeBackdrop) {
    return (
      <NativeBackdrop ref={targetRef} collapsable={collapsable} {...rest}>
        {children}
      </NativeBackdrop>
    );
  }

  return (
    <View ref={targetRef} collapsable={collapsable} {...rest}>
      {children}
    </View>
  );
});

function lerpRounded(min: number, max: number, normalized: number, precision = 1000): number {
  return Math.round((min + (max - min) * clamp(normalized, 0, 1)) * precision) / precision;
}

function resolveTransmissionColor(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
  liveBlurEnabled: boolean,
  tintAlphaOverride?: number,
): string {
  if (typeof tintAlphaOverride === 'number' && Number.isFinite(tintAlphaOverride)) {
    const clampedAlpha = Math.round(clamp(tintAlphaOverride, 0, 0.6) * 1000) / 1000;
    return tokens.liquidGlass.tintForScheme(scheme, clampedAlpha);
  }
  const palette = tokens.liquidGlass[scheme];
  const bucket = liveBlurEnabled ? palette.transmission.enhanced : palette.transmission.lightweight;

  if (typeof intensity === 'string') {
    return bucket[intensity] ?? bucket.regular;
  }

  const alphaScale = liveBlurEnabled ? palette.tintAlpha : palette.lightweightTintAlpha;
  const alpha = lerpRounded(alphaScale.subtle, alphaScale.prominent, intensity);
  return tokens.liquidGlass.tintForScheme(scheme, alpha);
}

function resolveTintAlpha(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
  tintAlphaOverride?: number,
): number {
  if (typeof tintAlphaOverride === 'number' && Number.isFinite(tintAlphaOverride)) {
    return clamp(tintAlphaOverride, 0, 0.6);
  }
  const palette = tokens.liquidGlass[scheme];
  if (typeof intensity === 'string') {
    return palette.tintAlpha[intensity] ?? palette.tintAlpha.regular;
  }
  return lerpRounded(palette.tintAlpha.subtle, palette.tintAlpha.prominent, intensity);
}

function resolveOpticalBlurDp(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
  blurRadiusOverride?: number,
): number {
  if (typeof blurRadiusOverride === 'number' && Number.isFinite(blurRadiusOverride)) {
    return clamp(blurRadiusOverride, 0, 24);
  }
  const palette = tokens.liquidGlass[scheme];
  if (typeof intensity === 'string') {
    return palette.opticalBlurDp[intensity] ?? palette.opticalBlurDp.regular;
  }
  return 0;
}

function resolveIosBlurIntensity(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
): number {
  const palette = tokens.liquidGlass[scheme];
  if (typeof intensity === 'string') {
    return palette.blurIntensity[intensity] ?? palette.blurIntensity.regular;
  }
  return Math.round(
    palette.blurIntensity.subtle +
      clamp(intensity, 0, 1) * (palette.blurIntensity.prominent - palette.blurIntensity.subtle),
  );
}

function resolveRenderEffectBlurDp(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
  blurRadiusOverride?: number,
): number {
  if (typeof blurRadiusOverride === 'number' && Number.isFinite(blurRadiusOverride)) {
    return clamp(blurRadiusOverride, 0, 24);
  }
  const palette = tokens.liquidGlass[scheme];
  const baseBlur = resolveIosBlurIntensity(scheme, intensity);
  const reductionFactor =
    typeof palette.blurReductionFactor === 'number' && palette.blurReductionFactor > 0
      ? palette.blurReductionFactor
      : 3;
  return clamp(Math.round((baseBlur / reductionFactor) * 10) / 10, 0, 24);
}

function resolveRefractionAmount(
  intensity: WiezLiquidGlassIntensity,
  refractionStrengthOverride?: number,
): number {
  if (typeof refractionStrengthOverride === 'number' && Number.isFinite(refractionStrengthOverride)) {
    return clamp(refractionStrengthOverride, 0, 2);
  }
  const table = tokens.liquidGlass.optics.refractionStrength;
  if (typeof intensity === 'string') {
    return table[intensity] ?? table.regular;
  }
  return lerpRounded(0.65, 1.25, intensity, 100);
}

/**
 * Shared WIEZ Liquid Glass optical material primitive.
 *
 * Shape-aware optical system across circles, pills, and rounded cards:
 * - Android API 33+ (`mode="enhanced"` + `blurTarget`): Single-pass hardware `RenderNode`
 *   + verified AGSL `RuntimeShader` with smooth finite-difference SDF normals, convex
 *   meniscus refraction, optional scatter blur (0dp default), sheer tint, and
 *   luminance-aware Fresnel edge lighting without 1px dark-ring outlines.
 * - Android API 31–32 (`mode="enhanced"` + `blurTarget`): Noise-free `RenderEffect` blur
 *   derived from `tokens.liquidGlass.{scheme}.blurIntensity / blurReductionFactor` +
 *   hairline SVG specular rim.
 * - Older APIs / `lightweight` / missing target / iOS fallback: Clean sheer translucent
 *   stack + hairline SVG rim (or `BlurView` on iOS `enhanced`).
 */
export const WiezLiquidGlass = React.memo(function WiezLiquidGlass({
  children,
  mode = 'lightweight',
  intensity = 'regular',
  borderRadius = tokens.radius.full,
  highlightIntensity = 1,
  tintMode = 'auto',
  refraction = true,
  refractionStrength,
  curvature = DEFAULT_CURVATURE,
  opticalThickness = DEFAULT_OPTICAL_THICKNESS,
  blurRadius,
  fresnelIntensity,
  reflectionIntensity,
  tintAlpha,
  chromaticAberration = DEFAULT_CHROMA,
  blurTarget,
  initialSize,
  pressed = false,
  pointerEvents,
  style,
  contentStyle,
  testID,
  ...accessibilityProps
}: WiezLiquidGlassProps) {
  const { scheme } = useTheme();
  const effectiveScheme: ThemeScheme = tintMode === 'auto' ? scheme : tintMode;
  const palette = tokens.liquidGlass[effectiveScheme];

  const instanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rimGradientId = `wlg-rim-${instanceId}`;

  const flattenedStyle = React.useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);
  const styleWidth =
    typeof flattenedStyle.width === 'number' && flattenedStyle.width > 0
      ? flattenedStyle.width
      : 0;
  const styleHeight =
    typeof flattenedStyle.height === 'number' && flattenedStyle.height > 0
      ? flattenedStyle.height
      : 0;
  const seedWidth =
    typeof initialSize?.width === 'number' && initialSize.width > 0 ? initialSize.width : 0;
  const seedHeight =
    typeof initialSize?.height === 'number' && initialSize.height > 0 ? initialSize.height : 0;

  const [layoutSize, setLayoutSize] = React.useState<WiezLiquidGlassSize | null>(null);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (styleWidth > 0 && styleHeight > 0) return;
      const nextWidth = Math.round(event.nativeEvent.layout.width * 10) / 10;
      const nextHeight = Math.round(event.nativeEvent.layout.height * 10) / 10;
      if (nextWidth <= 0 || nextHeight <= 0) return;

      setLayoutSize((previous) =>
        previous &&
        Math.abs(previous.width - nextWidth) < 0.5 &&
        Math.abs(previous.height - nextHeight) < 0.5
          ? previous
          : { width: nextWidth, height: nextHeight },
      );
    },
    [styleWidth, styleHeight],
  );

  const surfaceWidth = styleWidth > 0 ? styleWidth : (layoutSize?.width ?? seedWidth);
  const surfaceHeight = styleHeight > 0 ? styleHeight : (layoutSize?.height ?? seedHeight);

  const hasBlurTarget = Boolean(blurTarget?.current);
  const canUseEnhancedPlatform =
    mode === 'enhanced' &&
    supportsEnhancedLiquidGlass() &&
    (Platform.OS === 'ios' || hasBlurTarget);

  const androidTargetHandle =
    Platform.OS === 'android' && canUseEnhancedPlatform && blurTarget?.current
      ? findNodeHandle(blurTarget.current)
      : null;

  const NativeLensView =
    Platform.OS === 'android' &&
    canUseEnhancedPlatform &&
    androidTargetHandle != null &&
    isWiezLiquidGlassNativeAvailable()
      ? getWiezLiquidGlassLensNativeView()
      : null;

  const androidNativeLensActive =
    NativeLensView != null && supportsWiezLiquidGlassRenderEffectBlur();
  const androidAgslActive = androidNativeLensActive && supportsNativeLiquidGlassRefraction();
  const useIosNativeBlur = Platform.OS === 'ios' && canUseEnhancedPlatform;

  const liveOpticalBackdropActive = androidNativeLensActive || useIosNativeBlur;

  const transmissionColor = resolveTransmissionColor(
    effectiveScheme,
    intensity,
    liveOpticalBackdropActive,
    tintAlpha,
  );
  const tintAlphaValue = resolveTintAlpha(effectiveScheme, intensity, tintAlpha);
  const opticalBlurDp = resolveOpticalBlurDp(effectiveScheme, intensity, blurRadius);
  const renderEffectBlurDp = resolveRenderEffectBlurDp(effectiveScheme, intensity, blurRadius);
  const iosBlurIntensityValue = resolveIosBlurIntensity(effectiveScheme, intensity);
  const refractionAmount = resolveRefractionAmount(intensity, refractionStrength);
  const highlightScalar = highlightIntensity === false ? 0 : clamp(highlightIntensity, 0, 1.5);
  const effectiveRimStrength =
    typeof fresnelIntensity === 'number' && Number.isFinite(fresnelIntensity)
      ? clamp(fresnelIntensity, 0, 1.5)
      : highlightScalar;
  const effectiveReflectionStrength =
    typeof reflectionIntensity === 'number' && Number.isFinite(reflectionIntensity)
      ? clamp(reflectionIntensity, 0, 1.5)
      : highlightScalar;
  const effectiveCurvature = clamp(curvature, 0, 1);
  const effectiveThickness = clamp(opticalThickness, 0, 1);
  const effectiveChroma = clamp(chromaticAberration, 0, 1);

  const clampedBorderRadius =
    surfaceWidth > 0 && surfaceHeight > 0
      ? Math.min(Math.max(0, borderRadius), Math.min(surfaceWidth, surfaceHeight) / 2)
      : Math.max(0, borderRadius);

  const tintColorInt = toAndroidColorInt(palette.tintHex);

  // When Android API 33+ AGSL is active, refraction + blur + sheer tint + rim + corner
  // gloss all composite inside one hardware fragment shader pass; avoid stacking extra JS
  // gradient/SVG layers on top. API 31-32, iOS, and lightweight render the JS rim stack.
  const renderJsGlassOverlays = !androidAgslActive;
  const canRenderRimSvg =
    renderJsGlassOverlays && effectiveRimStrength > 0 && surfaceWidth > 6 && surfaceHeight > 6;

  return (
    <View
      {...accessibilityProps}
      pointerEvents={pointerEvents}
      testID={testID}
      onLayout={handleLayout}
      style={[
        styles.root,
        { borderRadius: clampedBorderRadius },
        Platform.OS === 'ios'
          ? {
              shadowColor: palette.shadowColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.28,
              shadowRadius: 6,
            }
          : styles.androidNoShadowArtifact,
        style,
      ]}
    >
      {/* Android API 31+ / 33+ native RenderNode optical lens */}
      {androidNativeLensActive && NativeLensView ? (
        <NativeLensView
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          targetViewId={androidTargetHandle ?? undefined}
          cornerRadius={clampedBorderRadius}
          blurRadius={
            androidAgslActive
              ? typeof blurRadius === 'number'
                ? opticalBlurDp
                : 0
              : renderEffectBlurDp
          }
          refractionStrength={androidAgslActive && refraction ? refractionAmount : 0}
          chromaticAberration={androidAgslActive ? effectiveChroma : 0}
          rimStrength={effectiveRimStrength}
          reflectionStrength={effectiveReflectionStrength}
          curvature={effectiveCurvature}
          opticalThickness={effectiveThickness}
          tintColor={tintColorInt}
          tintAlpha={tintAlphaValue}
          fallbackColor={0}
          isDark={effectiveScheme === 'dark'}
          pressed={pressed}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* iOS native UIVisualEffectView backdrop blur */}
      {useIosNativeBlur ? (
        <BlurView
          tint={palette.blurTint}
          intensity={iosBlurIntensityValue}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { borderRadius: clampedBorderRadius }]}
        />
      ) : null}

      {renderJsGlassOverlays ? (
        <>
          {/* Sheer optical transmission fill */}
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: transmissionColor, borderRadius: clampedBorderRadius },
            ]}
          />

          {/* Subtle internal surface balance (zero dark bottom mud) */}
          <ExpoLinearGradient
            colors={palette.depthColors}
            locations={DEPTH_LOCATIONS}
            start={DEPTH_START}
            end={DEPTH_END}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: clampedBorderRadius }]}
          />

          {/* Tight top-left outer crescent reflection highlight */}
          {effectiveReflectionStrength > 0 ? (
            <View
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[
                StyleSheet.absoluteFill,
                { opacity: clamp(effectiveReflectionStrength, 0, 1), borderRadius: clampedBorderRadius },
              ]}
            >
              <ExpoLinearGradient
                colors={palette.reflectionColors}
                locations={REFLECTION_LOCATIONS}
                start={REFLECTION_START}
                end={REFLECTION_END}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            </View>
          ) : null}

          {/* Interactive press sheen without opaque fill jumps */}
          {pressed ? (
            <View
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: palette.pressedOverlay, borderRadius: clampedBorderRadius },
              ]}
            />
          ) : null}
        </>
      ) : null}

      {/* Hairline curved directional specular rim (single stroke, no metallic bezel) */}
      {canRenderRimSvg ? (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          <Svg
            width={surfaceWidth}
            height={surfaceHeight}
            viewBox={`0 0 ${surfaceWidth} ${surfaceHeight}`}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient
                id={rimGradientId}
                x1="12%"
                y1="0%"
                x2="88%"
                y2="100%"
              >
                {palette.rimStops.map((stop) => (
                  <Stop
                    key={stop.offset}
                    offset={stop.offset}
                    stopColor={palette.specularHex}
                    stopOpacity={clamp(stop.opacity * effectiveRimStrength, 0, 1)}
                  />
                ))}
              </SvgLinearGradient>
            </Defs>
            <Rect
              x={0.5}
              y={0.5}
              width={surfaceWidth - 1}
              height={surfaceHeight - 1}
              rx={Math.max(0, clampedBorderRadius - 0.5)}
              ry={Math.max(0, clampedBorderRadius - 0.5)}
              fill="none"
              stroke={`url(#${rimGradientId})`}
              strokeWidth={0.85}
            />
          </Svg>
        </View>
      ) : null}

      {/* Foreground icons, labels, and interactive children */}
      {children != null ? (
        <View style={[styles.content, contentStyle]}>
          {children}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidNoShadowArtifact: {
    elevation: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default WiezLiquidGlass;
