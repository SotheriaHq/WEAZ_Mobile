import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { tokens, type ThemeScheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const ANDROID_HARDWARE_BLUR_MIN_API = 31;
const REFLECTION_START = { x: 0.08, y: 0.0 } as const;
const REFLECTION_END = { x: 0.88, y: 0.88 } as const;
const REFLECTION_LOCATIONS = [0, 0.28, 0.62] as const;
const DEPTH_START = { x: 0.5, y: 0.0 } as const;
const DEPTH_END = { x: 0.5, y: 1.0 } as const;
const DEPTH_LOCATIONS = [0, 0.2, 0.68, 1] as const;

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
   * - `lightweight`: pure multi-layer translucency, curved SVG specular rim lighting,
   *   static surface reflection, and depth shading with zero native blur pass.
   * - `enhanced`: layers Android 12+ (API 31+) hardware backdrop blur via
   *   `dimezisBlurViewSdk31Plus` when `blurTarget` is supplied; gracefully falls
   *   back to `lightweight` on API < 31 or when no target view is available.
   */
  mode?: WiezLiquidGlassMode;
  /** Visual density preset (`subtle` | `regular` | `prominent`) or normalized scalar `0..1`. */
  intensity?: WiezLiquidGlassIntensity;
  /** Corner radius in logical pixels. Defaults to circular/pill radius (`tokens.radius.full`). */
  borderRadius?: number;
  /** Specular rim and directional highlight intensity (`0..1`), or `false` to disable highlights. */
  highlightIntensity?: number | false;
  /** Follow active WIEZ theme (`auto`) or lock to `light` / `dark` optical tuning. */
  tintMode?: WiezLiquidGlassTintMode;
  /** Sibling/ancestor `BlurTargetView` ref paired with `WiezLiquidGlassBackdrop` on Android. */
  blurTarget?: React.RefObject<View | null>;
  /** Known control dimensions so curved rim geometry paints cleanly before async layout. */
  initialSize?: WiezLiquidGlassSize;
  /** Optional pressed state illumination without heavy opaque fill swaps. */
  pressed?: boolean;
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

/**
 * Synchronizes a target View ref as an immutable ref-object snapshot once mounted.
 *
 * `expo-blur`'s BlurView checks `prevProps.blurTarget?.current !== props.blurTarget?.current`
 * inside `componentDidUpdate`; passing a mutated `useRef` fails reference equality when
 * the container identity stays the same. Exposing a fresh snapshot upon target attachment
 * guarantees BlurView resolves the native target tag deterministically.
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
 * Wraps background media behind Android Liquid Glass controls so hardware blur
 * samples only underlying imagery cleanly without capturing controls themselves.
 */
export const WiezLiquidGlassBackdrop = React.memo(function WiezLiquidGlassBackdrop({
  targetRef,
  collapsable = false,
  children,
  ...rest
}: WiezLiquidGlassBackdropProps) {
  if (Platform.OS === 'android' && supportsEnhancedLiquidGlass()) {
    return (
      <BlurTargetView ref={targetRef} collapsable={collapsable} {...rest}>
        {children}
      </BlurTargetView>
    );
  }

  return (
    <View ref={targetRef} collapsable={collapsable} {...rest}>
      {children}
    </View>
  );
});

function resolveTransmissionColor(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
  liveBlurEnabled: boolean,
): string {
  const palette = tokens.liquidGlass[scheme];
  const bucket = liveBlurEnabled ? palette.transmission.enhanced : palette.transmission.lightweight;

  if (typeof intensity === 'string') {
    return bucket[intensity] ?? bucket.regular;
  }

  const normalized = clamp(intensity, 0, 1);
  if (scheme === 'dark') {
    const [minAlpha, maxAlpha] = liveBlurEnabled ? [0.08, 0.18] : [0.14, 0.27];
    const alpha = Math.round((minAlpha + (maxAlpha - minAlpha) * normalized) * 1000) / 1000;
    return tokens.liquidGlass.tintForScheme('dark', alpha);
  }

  const [minAlpha, maxAlpha] = liveBlurEnabled ? [0.03, 0.11] : [0.09, 0.19];
  const alpha = Math.round((minAlpha + (maxAlpha - minAlpha) * normalized) * 1000) / 1000;
  return tokens.liquidGlass.tintForScheme('light', alpha);
}

function resolveBlurIntensity(
  scheme: ThemeScheme,
  intensity: WiezLiquidGlassIntensity,
): number {
  const palette = tokens.liquidGlass[scheme];
  if (typeof intensity === 'string') {
    return palette.blurIntensity[intensity] ?? palette.blurIntensity.regular;
  }
  const normalized = clamp(intensity, 0, 1);
  return Math.round(10 + normalized * 14);
}

/**
 * Shared WIEZ Liquid Glass optical material primitive.
 *
 * Approximates curved optical glass using transparent transmission fills,
 * optional hardware-accelerated Android 12+ backdrop softening, directional
 * specular edge rim lighting, static surface reflection, and restrained
 * depth shading. Does not perform geometric background pixel displacement.
 */
export const WiezLiquidGlass = React.memo(function WiezLiquidGlass({
  children,
  mode = 'lightweight',
  intensity = 'regular',
  borderRadius = tokens.radius.full,
  highlightIntensity = 1,
  tintMode = 'auto',
  blurTarget,
  initialSize,
  pressed = false,
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
  const explicitWidth =
    typeof initialSize?.width === 'number'
      ? initialSize.width
      : typeof flattenedStyle.width === 'number'
        ? flattenedStyle.width
        : 0;
  const explicitHeight =
    typeof initialSize?.height === 'number'
      ? initialSize.height
      : typeof flattenedStyle.height === 'number'
        ? flattenedStyle.height
        : 0;

  const [measuredSize, setMeasuredSize] = React.useState<WiezLiquidGlassSize>(() => ({
    width: explicitWidth,
    height: explicitHeight,
  }));

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width * 10) / 10;
    const nextHeight = Math.round(event.nativeEvent.layout.height * 10) / 10;
    if (nextWidth <= 0 || nextHeight <= 0) return;

    setMeasuredSize((previous) =>
      Math.abs(previous.width - nextWidth) < 0.5 &&
      Math.abs(previous.height - nextHeight) < 0.5
        ? previous
        : { width: nextWidth, height: nextHeight },
    );
  }, []);

  const surfaceWidth = explicitWidth > 0 ? explicitWidth : measuredSize.width;
  const surfaceHeight = explicitHeight > 0 ? explicitHeight : measuredSize.height;

  const hasBlurTarget = Boolean(blurTarget?.current);
  const canUseEnhancedBlur =
    mode === 'enhanced' &&
    supportsEnhancedLiquidGlass() &&
    (Platform.OS === 'ios' || hasBlurTarget);

  // Android `ExpoBlurView` defaults `blurTargetId` to `undefined` on its first
  // render and sets `BlurMethod.NONE` + an opaque fallback background if
  // `blurMethod` mounts ahead of `blurTargetId`. Enabling the SDK 31+ blur
  // method after mount ensures `ExpoBlurView` resets its host View to
  // transparent and activates hardware blur cleanly.
  const [androidBlurActivated, setAndroidBlurActivated] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'android' || !canUseEnhancedBlur) {
      setAndroidBlurActivated(false);
      return undefined;
    }
    setAndroidBlurActivated(true);
    return () => {
      setAndroidBlurActivated(false);
    };
  }, [canUseEnhancedBlur, blurTarget]);

  const liveBlurActive =
    Platform.OS === 'ios'
      ? canUseEnhancedBlur
      : Platform.OS === 'android'
        ? canUseEnhancedBlur && androidBlurActivated
        : false;

  const transmissionColor = resolveTransmissionColor(effectiveScheme, intensity, canUseEnhancedBlur);
  const blurIntensityValue = resolveBlurIntensity(effectiveScheme, intensity);
  const highlightScalar = highlightIntensity === false ? 0 : clamp(highlightIntensity, 0, 1);

  const clampedBorderRadius =
    surfaceWidth > 0 && surfaceHeight > 0
      ? Math.min(Math.max(0, borderRadius), Math.min(surfaceWidth, surfaceHeight) / 2)
      : Math.max(0, borderRadius);

  const canRenderRimSvg = highlightScalar > 0 && surfaceWidth > 6 && surfaceHeight > 6;

  return (
    <View
      {...accessibilityProps}
      testID={testID}
      onLayout={handleLayout}
      style={[
        styles.root,
        { borderRadius: clampedBorderRadius },
        Platform.OS === 'ios'
          ? {
              shadowColor: palette.shadowColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.35,
              shadowRadius: 6,
            }
          : styles.androidNoShadowArtifact,
        style,
      ]}
    >
      {/* Layer 2 — Optional native backdrop blur behind transmission tint */}
      {canUseEnhancedBlur ? (
        <BlurView
          blurTarget={Platform.OS === 'android' ? blurTarget : undefined}
          blurMethod={
            Platform.OS === 'android'
              ? liveBlurActive
                ? 'dimezisBlurViewSdk31Plus'
                : 'none'
              : undefined
          }
          tint={palette.blurTint}
          intensity={Platform.OS === 'android' && !liveBlurActive ? 0 : blurIntensityValue}
          blurReductionFactor={palette.blurReductionFactor}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { borderRadius: clampedBorderRadius }]}
        />
      ) : null}

      {/* Layer 1 — Low-opacity optical transmission fill */}
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: transmissionColor, borderRadius: clampedBorderRadius },
        ]}
      />

      {/* Layer 5 — Restrained internal meniscus depth shading */}
      <ExpoLinearGradient
        colors={palette.depthColors}
        locations={DEPTH_LOCATIONS}
        start={DEPTH_START}
        end={DEPTH_END}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: clampedBorderRadius }]}
      />

      {/* Layer 4 — Static asymmetric directional surface reflection */}
      {highlightScalar > 0 ? (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            { opacity: highlightScalar, borderRadius: clampedBorderRadius },
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

      {/* Interactive press sheen — light catch without opaque fill shifts */}
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

      {/* Layer 3 — Curved directional specular rim lighting & Fresnel edge */}
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
                    stopOpacity={stop.opacity * highlightScalar}
                  />
                ))}
              </SvgLinearGradient>
            </Defs>
            <G>
              <Rect
                x={0.5}
                y={0.5}
                width={surfaceWidth - 1}
                height={surfaceHeight - 1}
                rx={Math.max(0, clampedBorderRadius - 0.5)}
                ry={Math.max(0, clampedBorderRadius - 0.5)}
                fill="none"
                stroke={palette.outerFresnelHex}
                strokeOpacity={palette.outerFresnelOpacity * highlightScalar}
                strokeWidth={1}
              />
              <Rect
                x={1.45}
                y={1.45}
                width={surfaceWidth - 2.9}
                height={surfaceHeight - 2.9}
                rx={Math.max(0, clampedBorderRadius - 1.45)}
                ry={Math.max(0, clampedBorderRadius - 1.45)}
                fill="none"
                stroke={`url(#${rimGradientId})`}
                strokeWidth={1.35}
              />
            </G>
          </Svg>
        </View>
      ) : null}

      {/* Layer 6 — Foreground icons, labels, and interactive children */}
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
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
