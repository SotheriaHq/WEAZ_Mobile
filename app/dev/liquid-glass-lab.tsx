import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { QuickPressable } from '@/components/ui/QuickPressable';
import {
  WiezLiquidGlass,
  WiezLiquidGlassBackdrop,
  getLiquidGlassCapabilities,
  useLiquidGlassBlurTarget,
} from '@/components/ui/WiezLiquidGlass';
import { isLiquidGlassLabEnabled } from '@/src/features/dev/liquidGlassLabGate';
import { tokens, type ThemeScheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type LabPresetId =
  | 'calibrated'
  | 'proof'
  | 'off'
  | 'raw'
  | 'dome'
  | 'crisp'
  | 'frosted';

type LabBackgroundId = 'grid' | 'stripes' | 'photo';

type OpticalSettings = {
  preset: LabPresetId;
  rawHidden: boolean;
  refractionEnabled: boolean;
  refractionStrength: number;
  curvature: number;
  opticalThickness: number;
  blurRadius: number;
  fresnelIntensity: number;
  reflectionIntensity: number;
  tintAlpha: number | undefined;
  chromaticAberration: number;
};

const PRESET_CONFIGS: Record<
  LabPresetId,
  { label: string; apply: () => OpticalSettings }
> = {
  calibrated: {
    label: 'Calibrated',
    apply: () => ({
      preset: 'calibrated',
      rawHidden: false,
      refractionEnabled: true,
      refractionStrength: 0.9,
      curvature: 0.58,
      opticalThickness: 0.42,
      blurRadius: 0,
      fresnelIntensity: 1.0,
      reflectionIntensity: 1.0,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
  proof: {
    label: 'Proof',
    apply: () => ({
      preset: 'proof',
      rawHidden: false,
      refractionEnabled: true,
      refractionStrength: 1.45,
      curvature: 0.68,
      opticalThickness: 0.65,
      blurRadius: 0,
      fresnelIntensity: 1.1,
      reflectionIntensity: 1.05,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
  off: {
    label: '0px Off',
    apply: () => ({
      preset: 'off',
      rawHidden: false,
      refractionEnabled: false,
      refractionStrength: 0.9,
      curvature: 0.58,
      opticalThickness: 0.42,
      blurRadius: 0,
      fresnelIntensity: 1.0,
      reflectionIntensity: 1.0,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
  raw: {
    label: 'Raw',
    apply: () => ({
      preset: 'raw',
      rawHidden: true,
      refractionEnabled: false,
      refractionStrength: 0,
      curvature: 0.58,
      opticalThickness: 0.42,
      blurRadius: 0,
      fresnelIntensity: 0,
      reflectionIntensity: 0,
      tintAlpha: 0,
      chromaticAberration: 0,
    }),
  },
  dome: {
    label: 'Dome',
    apply: () => ({
      preset: 'dome',
      rawHidden: false,
      refractionEnabled: true,
      refractionStrength: 1.15,
      curvature: 0.88,
      opticalThickness: 0.72,
      blurRadius: 0,
      fresnelIntensity: 1.05,
      reflectionIntensity: 1.1,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
  crisp: {
    label: 'Crisp Lip',
    apply: () => ({
      preset: 'crisp',
      rawHidden: false,
      refractionEnabled: true,
      refractionStrength: 0.92,
      curvature: 0.22,
      opticalThickness: 0.35,
      blurRadius: 0,
      fresnelIntensity: 1.0,
      reflectionIntensity: 0.9,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
  frosted: {
    label: 'Blur 6dp',
    apply: () => ({
      preset: 'frosted',
      rawHidden: false,
      refractionEnabled: true,
      refractionStrength: 0.9,
      curvature: 0.58,
      opticalThickness: 0.42,
      blurRadius: 6,
      fresnelIntensity: 1.0,
      reflectionIntensity: 1.0,
      tintAlpha: undefined,
      chromaticAberration: 0,
    }),
  },
};

const PRESET_ORDER: readonly LabPresetId[] = [
  'raw',
  'off',
  'calibrated',
  'proof',
  'dome',
  'crisp',
  'frosted',
];

const BACKGROUND_OPTIONS: ReadonlyArray<{ id: LabBackgroundId; label: string }> = [
  { id: 'grid', label: 'Grid' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'photo', label: 'Photo' },
];

const STAGE_HEIGHT = 276;
const SCROLL_PANEL_HEIGHT = 188;
const SVG_GRID_W = 420;
const SVG_GRID_H = 300;
const MINOR_STEP = 16;
const MAJOR_STEP = 48;
const SCROLL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumericParam(raw: string | string[] | undefined, fallback: number, min: number, max: number): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return fallback;
  const parsed = Number(val);
  if (!Number.isFinite(parsed)) return fallback;
  return roundTwo(clamp(parsed, min, max));
}

function SpecimenBackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" pointerEvents="none">
      <Line
        x1={19}
        y1={12}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphStroke}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Line
        x1={11}
        y1={6}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphStroke}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Line
        x1={11}
        y1={18}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphStroke}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Line
        x1={19}
        y1={12}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphFill}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Line
        x1={11}
        y1={6}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphFill}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Line
        x1={11}
        y1={18}
        x2={5}
        y2={12}
        stroke={tokens.liquidGlass.menuGlyphFill}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SpecimenMenuDots() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" pointerEvents="none">
      {[5.5, 12, 18.5].map((cx) => (
        <Circle
          key={cx}
          cx={cx}
          cy={12}
          r={2.25}
          fill={tokens.liquidGlass.menuGlyphFill}
          stroke={tokens.liquidGlass.menuGlyphStroke}
          strokeWidth={1.35}
        />
      ))}
    </Svg>
  );
}

function StagePatternCanvas({
  background,
  stageScheme,
  motionOffsetX,
  motionOffsetY,
}: {
  background: LabBackgroundId;
  stageScheme: ThemeScheme;
  motionOffsetX: Animated.Value;
  motionOffsetY: Animated.Value;
}) {
  const labPalette = tokens.liquidGlass.lab[stageScheme];

  const vMinor: number[] = [];
  for (let x = 0; x <= SVG_GRID_W; x += MINOR_STEP) vMinor.push(x);
  const hMinor: number[] = [];
  for (let y = 0; y <= SVG_GRID_H; y += MINOR_STEP) hMinor.push(y);

  const vMajor: number[] = [];
  for (let x = 0; x <= SVG_GRID_W; x += MAJOR_STEP) vMajor.push(x);
  const hMajor: number[] = [];
  for (let y = 0; y <= SVG_GRID_H; y += MAJOR_STEP) hMajor.push(y);

  return (
    <Animated.View
      style={[
        styles.patternMotionLayer,
        {
          backgroundColor: labPalette.stageBg,
          transform: [
            { translateX: motionOffsetX },
            { translateY: motionOffsetY },
          ],
        },
      ]}
    >
      {background === 'grid' ? (
        <View style={styles.patternFill}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${SVG_GRID_W} ${SVG_GRID_H}`}
            preserveAspectRatio="none"
          >
            <Rect
              x={0}
              y={0}
              width={SVG_GRID_W}
              height={SVG_GRID_H}
              fill={labPalette.stageBg}
            />
            {vMinor.map((x) => (
              <Line
                key={`vm-${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={SVG_GRID_H}
                stroke={labPalette.gridMinor}
                strokeWidth={1}
              />
            ))}
            {hMinor.map((y) => (
              <Line
                key={`hm-${y}`}
                x1={0}
                y1={y}
                x2={SVG_GRID_W}
                y2={y}
                stroke={labPalette.gridMinor}
                strokeWidth={1}
              />
            ))}
            {vMajor.map((x) => (
              <Line
                key={`vM-${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={SVG_GRID_H}
                stroke={labPalette.gridMajor}
                strokeWidth={2.2}
              />
            ))}
            {hMajor.map((y) => (
              <Line
                key={`hM-${y}`}
                x1={0}
                y1={y}
                x2={SVG_GRID_W}
                y2={y}
                stroke={labPalette.gridMajor}
                strokeWidth={2.2}
              />
            ))}
            {/* High-contrast horizontal & diagonal reference beams crossing every glass perimeter */}
            <Line
              x1={0}
              y1={40}
              x2={SVG_GRID_W}
              y2={40}
              stroke={labPalette.gridAccent}
              strokeWidth={4}
            />
            <Line
              x1={0}
              y1={136}
              x2={SVG_GRID_W}
              y2={136}
              stroke={labPalette.gridAccent}
              strokeWidth={4.5}
            />
            <Line
              x1={0}
              y1={228}
              x2={SVG_GRID_W}
              y2={228}
              stroke={labPalette.gridDiagonal}
              strokeWidth={4}
            />
            <Line
              x1={0}
              y1={0}
              x2={SVG_GRID_W}
              y2={SVG_GRID_H}
              stroke={labPalette.gridDiagonal}
              strokeWidth={2.5}
            />
            <Line
              x1={SVG_GRID_W}
              y1={0}
              x2={0}
              y2={SVG_GRID_H}
              stroke={labPalette.gridAccent}
              strokeWidth={2.5}
            />
          </Svg>
          <View style={styles.gridTypographyBand} pointerEvents="none">
            <AppText
              variant="smallBold"
              onDarkStage={stageScheme === 'dark'}
              onLightStage={stageScheme === 'light'}
              tone="default"
              style={styles.gridTextLineTop}
            >
              WIEZ OPTICAL BENCH 0123456789 AABBCCDD
            </AppText>
            <AppText
              variant="cardTitle"
              onDarkStage={stageScheme === 'dark'}
              onLightStage={stageScheme === 'light'}
              tone="primary"
              style={styles.gridTextLineUpperEdge}
            >
              MENISCUS EDGE LINE 0123456789 REFRACT
            </AppText>
            <AppText
              variant="smallBold"
              onDarkStage={stageScheme === 'dark'}
              onLightStage={stageScheme === 'light'}
              tone="default"
              style={styles.gridTextLineLowerEdge}
            >
              CLEAR CENTER · CURVED SNELL BOUNDARY
            </AppText>
          </View>
        </View>
      ) : null}

      {background === 'stripes' ? (
        <View style={styles.patternFill}>
          <View style={styles.stripeRow}>
            {Array.from({ length: 18 }).map((_, idx) => (
              <View
                key={`st-${idx}`}
                style={[
                  styles.stripeCol,
                  {
                    backgroundColor:
                      labPalette.stripeColors[
                        idx % labPalette.stripeColors.length
                      ],
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.stripeOverlayBars} pointerEvents="none">
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${SVG_GRID_W} ${SVG_GRID_H}`}
              preserveAspectRatio="none"
            >
              <Line
                x1={0}
                y1={28}
                x2={SVG_GRID_W}
                y2={28}
                stroke={labPalette.gridMajor}
                strokeWidth={5}
              />
              <Line
                x1={0}
                y1={96}
                x2={SVG_GRID_W}
                y2={96}
                stroke={labPalette.gridAccent}
                strokeWidth={5}
              />
              <Line
                x1={0}
                y1={174}
                x2={SVG_GRID_W}
                y2={174}
                stroke={labPalette.gridMajor}
                strokeWidth={5}
              />
              <Line
                x1={0}
                y1={238}
                x2={SVG_GRID_W}
                y2={238}
                stroke={labPalette.gridDiagonal}
                strokeWidth={5}
              />
            </Svg>
          </View>
        </View>
      ) : null}

      {background === 'photo' ? (
        <View style={styles.patternFill}>
          <ExpoLinearGradient
            colors={labPalette.photoGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.patternFill}
          />
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${SVG_GRID_W} ${SVG_GRID_H}`}
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFill}
          >
            <Circle
              cx={92}
              cy={88}
              r={68}
              fill="none"
              stroke={tokens.liquidGlass.lab.inkOnDark}
              strokeWidth={3}
            />
            <Circle
              cx={304}
              cy={170}
              r={84}
              fill="none"
              stroke={tokens.liquidGlass.lab.inkOnDark}
              strokeWidth={3}
            />
            <Line
              x1={0}
              y1={64}
              x2={SVG_GRID_W}
              y2={240}
              stroke={tokens.liquidGlass.lab.inkOnDark}
              strokeWidth={2.5}
            />
            <Line
              x1={210}
              y1={0}
              x2={210}
              y2={SVG_GRID_H}
              stroke={tokens.liquidGlass.lab.inkOnDark}
              strokeWidth={2}
            />
          </Svg>
          <View style={styles.photoTypographyBand} pointerEvents="none">
            <AppText variant="display" onDarkStage tone="default">
              WIEZ ATELIER
            </AppText>
            <AppText variant="subtitle" onDarkStage tone="default">
              Editorial Gradient & Geometry
            </AppText>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

function ParamStepperRow({
  label,
  valueText,
  onDecrement,
  onIncrement,
}: {
  label: string;
  valueText: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.stepperRow,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <View style={styles.stepperLabelCol}>
        <AppText variant="smallBold">{label}</AppText>
        <AppText variant="captionRegular" tone="muted">
          {valueText}
        </AppText>
      </View>
      <View style={styles.stepperControls}>
        <QuickPressable
          onPress={onDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={[
            styles.stepBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <AppText variant="buttonLabel">−</AppText>
        </QuickPressable>
        <QuickPressable
          onPress={onIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={[
            styles.stepBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <AppText variant="buttonLabel">+</AppText>
        </QuickPressable>
      </View>
    </View>
  );
}

export default function LiquidGlassLabScreen() {
  if (!isLiquidGlassLabEnabled()) {
    return <Redirect href="/" />;
  }

  return <LiquidGlassLabContent />;
}

function LiquidGlassLabContent() {
  const { scheme, themePreference, setThemePreference, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    preset?: string;
    bg?: string;
    stageTheme?: string;
    motion?: string;
    refract?: string;
    curvature?: string;
    thickness?: string;
    blur?: string;
    fresnel?: string;
    refl?: string;
    tint?: string;
    chroma?: string;
  }>();

  const capabilities = useMemo(() => getLiquidGlassCapabilities(), []);

  const [background, setBackground] = useState<LabBackgroundId>('grid');
  const [stageScheme, setStageScheme] = useState<ThemeScheme>(scheme);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [optical, setOptical] = useState<OpticalSettings>(() =>
    PRESET_CONFIGS.calibrated.apply(),
  );

  // Sync deep-link query params whenever launched via `wiezmobile://dev/liquid-glass-lab?...`
  useEffect(() => {
    const presetParam = typeof params.preset === 'string' ? params.preset : '';
    if (presetParam && presetParam in PRESET_CONFIGS) {
      setOptical(PRESET_CONFIGS[presetParam as LabPresetId].apply());
    }
    const bgParam = typeof params.bg === 'string' ? params.bg : '';
    if (bgParam === 'grid' || bgParam === 'stripes' || bgParam === 'photo') {
      setBackground(bgParam);
    }
    const stageParam = typeof params.stageTheme === 'string' ? params.stageTheme : '';
    if (stageParam === 'light' || stageParam === 'dark') {
      setStageScheme(stageParam);
    }
    const motionParam = typeof params.motion === 'string' ? params.motion : '';
    if (motionParam === '1' || motionParam === 'true') {
      setMotionEnabled(true);
    } else if (motionParam === '0' || motionParam === 'false') {
      setMotionEnabled(false);
    }
    if (
      params.refract !== undefined ||
      params.curvature !== undefined ||
      params.thickness !== undefined ||
      params.blur !== undefined ||
      params.fresnel !== undefined ||
      params.refl !== undefined ||
      params.tint !== undefined ||
      params.chroma !== undefined
    ) {
      setOptical((prev) => ({
        ...prev,
        rawHidden: false,
        refractionEnabled:
          params.refract === '0' ? false : prev.refractionEnabled,
        refractionStrength: parseNumericParam(
          params.refract,
          prev.refractionStrength,
          0,
          2,
        ),
        curvature: parseNumericParam(params.curvature, prev.curvature, 0, 1),
        opticalThickness: parseNumericParam(
          params.thickness,
          prev.opticalThickness,
          0,
          1,
        ),
        blurRadius: parseNumericParam(params.blur, prev.blurRadius, 0, 24),
        fresnelIntensity: parseNumericParam(
          params.fresnel,
          prev.fresnelIntensity,
          0,
          1.5,
        ),
        reflectionIntensity: parseNumericParam(
          params.refl,
          prev.reflectionIntensity,
          0,
          1.5,
        ),
        tintAlpha:
          params.tint !== undefined
            ? parseNumericParam(params.tint, 0.02, 0, 0.6)
            : prev.tintAlpha,
        chromaticAberration: parseNumericParam(
          params.chroma,
          prev.chromaticAberration,
          0,
          1,
        ),
      }));
    }
  }, [
    params.bg,
    params.blur,
    params.chroma,
    params.curvature,
    params.fresnel,
    params.motion,
    params.preset,
    params.refl,
    params.refract,
    params.stageTheme,
    params.thickness,
    params.tint,
  ]);

  const motionOffsetX = useRef(new Animated.Value(0)).current;
  const motionOffsetY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!motionEnabled) {
      motionOffsetX.stopAnimation();
      motionOffsetY.stopAnimation();
      motionOffsetX.setValue(0);
      motionOffsetY.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(motionOffsetX, {
            toValue: -28,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(motionOffsetY, {
            toValue: -12,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(motionOffsetX, {
            toValue: 28,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(motionOffsetY, {
            toValue: 12,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      motionOffsetX.setValue(0);
      motionOffsetY.setValue(0);
    };
  }, [motionEnabled, motionOffsetX, motionOffsetY]);

  const {
    targetRef: mainTargetRef,
    blurTargetRef: mainBlurTargetRef,
    onTargetLayout: onMainTargetLayout,
  } = useLiquidGlassBlurTarget();

  const {
    targetRef: scrollTargetRef,
    blurTargetRef: scrollBlurTargetRef,
    onTargetLayout: onScrollTargetLayout,
  } = useLiquidGlassBlurTarget();

  const handleSelectPreset = useCallback((id: LabPresetId) => {
    setOptical(PRESET_CONFIGS[id].apply());
  }, []);

  const handleCycleThemePreference = useCallback(() => {
    const cycle = ['light', 'dark', 'system'] as const;
    const nextPref = cycle[(cycle.indexOf(themePreference) + 1) % cycle.length];
    setThemePreference(nextPref);
    if (nextPref === 'light' || nextPref === 'dark') {
      setStageScheme(nextPref);
    }
  }, [setThemePreference, themePreference]);

  const scrollLabPalette = tokens.liquidGlass.lab[stageScheme];
  const shaderStatusLabel = capabilities.agslRefractionSupported
    ? `API ${capabilities.apiLevel ?? '-'} · AGSL v${capabilities.engineVersion}`
    : capabilities.enhancedSupported
      ? `API ${capabilities.apiLevel ?? '-'} · Blur Fallback`
      : 'Lightweight Fallback';

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
      edges={['top']}
    >
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings/theme" />
        <View style={styles.topBarTitleWrap}>
          <AppText variant="subtitle">Liquid Glass Lab</AppText>
          <AppText variant="statLabel" tone="primary">
            {shaderStatusLabel}
          </AppText>
        </View>
        <QuickPressable
          onPress={handleCycleThemePreference}
          accessibilityRole="button"
          accessibilityLabel="Cycle app theme mode"
          style={[
            styles.topActionChip,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <AppText variant="badgeLabel">
            {themePreference === 'system' ? 'Auto' : themePreference === 'dark' ? 'Dark' : 'Light'}
          </AppText>
        </QuickPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + tokens.spacing['2xl'] },
        ]}
      >
        {/* Background, Stage Polarity, and Live Motion Controls */}
        <View style={styles.chipRow}>
          {BACKGROUND_OPTIONS.map((opt) => {
            const active = background === opt.id;
            return (
              <QuickPressable
                key={opt.id}
                onPress={() => setBackground(opt.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.compactChip,
                  {
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                    backgroundColor: active
                      ? theme.colors.primarySoft
                      : theme.colors.surface,
                  },
                ]}
              >
                <AppText
                  variant="badgeLabel"
                  tone={active ? 'primary' : 'default'}
                >
                  {opt.label}
                </AppText>
              </QuickPressable>
            );
          })}

          <QuickPressable
            onPress={() =>
              setStageScheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
            }
            accessibilityRole="button"
            style={[
              styles.compactChip,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <AppText variant="badgeLabel">
              {`Stage: ${stageScheme === 'dark' ? 'Dark' : 'Light'}`}
            </AppText>
          </QuickPressable>

          <QuickPressable
            onPress={() => setMotionEnabled((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ selected: motionEnabled }}
            style={[
              styles.compactChip,
              {
                borderColor: motionEnabled
                  ? theme.colors.primary
                  : theme.colors.border,
                backgroundColor: motionEnabled
                  ? theme.colors.primarySoft
                  : theme.colors.surface,
              },
            ]}
          >
            <AppText
              variant="badgeLabel"
              tone={motionEnabled ? 'primary' : 'default'}
            >
              {motionEnabled ? 'Motion: Live' : 'Motion: Static'}
            </AppText>
          </QuickPressable>
        </View>

        {/* Optical Comparison Presets */}
        <View style={styles.chipRow}>
          {PRESET_ORDER.map((presetId) => {
            const active = optical.preset === presetId;
            return (
              <QuickPressable
                key={presetId}
                onPress={() => handleSelectPreset(presetId)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.compactChip,
                  {
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                    backgroundColor: active
                      ? theme.colors.primarySoft
                      : theme.colors.surface,
                  },
                ]}
              >
                <AppText
                  variant="badgeLabel"
                  tone={active ? 'primary' : 'default'}
                >
                  {PRESET_CONFIGS[presetId].label}
                </AppText>
              </QuickPressable>
            );
          })}
        </View>

        {/* PRIMARY OPTICAL STAGE: Real WiezLiquidGlassBackdrop + Multi-Shape Specimens */}
        <View
          testID="liquid-glass-lab-stage"
          style={[styles.stageFrame, { borderColor: theme.colors.border }]}
        >
          <WiezLiquidGlassBackdrop
            targetRef={mainTargetRef}
            onLayout={onMainTargetLayout}
            style={styles.stageBackdrop}
          >
            <StagePatternCanvas
              background={background}
              stageScheme={stageScheme}
              motionOffsetX={motionOffsetX}
              motionOffsetY={motionOffsetY}
            />
          </WiezLiquidGlassBackdrop>

          {!optical.rawHidden ? (
            <View style={styles.specimenOverlay} pointerEvents="box-none">
              {/* Row 1: Small Circular Button (48dp), Medium Circle (56dp), Pill (164x48dp) */}
              <View style={styles.specimenTopRow}>
                <WiezLiquidGlass
                  mode="enhanced"
                  tintMode={stageScheme}
                  blurTarget={mainBlurTargetRef}
                  borderRadius={tokens.radius.full}
                  initialSize={{ width: 48, height: 48 }}
                  refraction={optical.refractionEnabled}
                  refractionStrength={optical.refractionStrength}
                  curvature={optical.curvature}
                  opticalThickness={optical.opticalThickness}
                  blurRadius={optical.blurRadius}
                  fresnelIntensity={optical.fresnelIntensity}
                  reflectionIntensity={optical.reflectionIntensity}
                  tintAlpha={optical.tintAlpha}
                  chromaticAberration={optical.chromaticAberration}
                  testID="lab-circle-48"
                  style={styles.circle48}
                >
                  <SpecimenMenuDots />
                </WiezLiquidGlass>

                <WiezLiquidGlass
                  mode="enhanced"
                  tintMode={stageScheme}
                  blurTarget={mainBlurTargetRef}
                  borderRadius={tokens.radius.full}
                  initialSize={{ width: 56, height: 56 }}
                  refraction={optical.refractionEnabled}
                  refractionStrength={optical.refractionStrength}
                  curvature={optical.curvature}
                  opticalThickness={optical.opticalThickness}
                  blurRadius={optical.blurRadius}
                  fresnelIntensity={optical.fresnelIntensity}
                  reflectionIntensity={optical.reflectionIntensity}
                  tintAlpha={optical.tintAlpha}
                  chromaticAberration={optical.chromaticAberration}
                  testID="lab-circle-56"
                  style={styles.circle56}
                >
                  <SpecimenBackArrow />
                </WiezLiquidGlass>

                <WiezLiquidGlass
                  mode="enhanced"
                  tintMode={stageScheme}
                  blurTarget={mainBlurTargetRef}
                  borderRadius={tokens.radius.full}
                  initialSize={{ width: 164, height: 48 }}
                  refraction={optical.refractionEnabled}
                  refractionStrength={optical.refractionStrength}
                  curvature={optical.curvature}
                  opticalThickness={optical.opticalThickness}
                  blurRadius={optical.blurRadius}
                  fresnelIntensity={optical.fresnelIntensity}
                  reflectionIntensity={optical.reflectionIntensity}
                  tintAlpha={optical.tintAlpha}
                  chromaticAberration={optical.chromaticAberration}
                  testID="lab-pill-164"
                  style={styles.pill164}
                >
                  <AppText
                    variant="smallBold"
                    onDarkStage={stageScheme === 'dark'}
                    onLightStage={stageScheme === 'light'}
                    tone="default"
                  >
                    Liquid Pill
                  </AppText>
                </WiezLiquidGlass>
              </View>

              {/* Row 2: Large Rounded Surface Card (296x104dp) */}
              <View style={styles.specimenMidRow}>
                <WiezLiquidGlass
                  mode="enhanced"
                  tintMode={stageScheme}
                  blurTarget={mainBlurTargetRef}
                  borderRadius={tokens.radius.xl}
                  initialSize={{ width: 296, height: 104 }}
                  refraction={optical.refractionEnabled}
                  refractionStrength={optical.refractionStrength}
                  curvature={optical.curvature}
                  opticalThickness={optical.opticalThickness}
                  blurRadius={optical.blurRadius}
                  fresnelIntensity={optical.fresnelIntensity}
                  reflectionIntensity={optical.reflectionIntensity}
                  tintAlpha={optical.tintAlpha}
                  chromaticAberration={optical.chromaticAberration}
                  testID="lab-card-296"
                  style={styles.largeCard}
                >
                  <AppText
                    variant="cardTitle"
                    onDarkStage={stageScheme === 'dark'}
                    onLightStage={stageScheme === 'light'}
                    tone="default"
                  >
                    Rounded Surface Lens
                  </AppText>
                  <AppText
                    variant="captionRegular"
                    onDarkStage={stageScheme === 'dark'}
                    onLightStage={stageScheme === 'light'}
                    tone="secondary"
                  >
                    {`R=${optical.refractionEnabled ? optical.refractionStrength.toFixed(2) : '0.00'} · C=${optical.curvature.toFixed(2)} · T=${optical.opticalThickness.toFixed(2)}`}
                  </AppText>
                </WiezLiquidGlass>
              </View>

              {/* Row 3: Wide Elongated Bar Pill (264x48dp) */}
              <View style={styles.specimenBottomRow}>
                <WiezLiquidGlass
                  mode="enhanced"
                  tintMode={stageScheme}
                  blurTarget={mainBlurTargetRef}
                  borderRadius={tokens.radius.full}
                  initialSize={{ width: 264, height: 48 }}
                  refraction={optical.refractionEnabled}
                  refractionStrength={optical.refractionStrength}
                  curvature={optical.curvature}
                  opticalThickness={optical.opticalThickness}
                  blurRadius={optical.blurRadius}
                  fresnelIntensity={optical.fresnelIntensity}
                  reflectionIntensity={optical.reflectionIntensity}
                  tintAlpha={optical.tintAlpha}
                  chromaticAberration={optical.chromaticAberration}
                  testID="lab-pill-wide"
                  style={styles.pillWide}
                >
                  <AppText
                    variant="smallBold"
                    onDarkStage={stageScheme === 'dark'}
                    onLightStage={stageScheme === 'light'}
                    tone="default"
                  >
                    Elongated Meniscus Bar
                  </AppText>
                </WiezLiquidGlass>
              </View>
            </View>
          ) : null}
        </View>

        {/* Live Scroll-Under-Glass Test Panel */}
        <AppText variant="sectionTitle">Live Scroll Under Glass</AppText>
        <View
          style={[
            styles.scrollPanelFrame,
            { borderColor: theme.colors.border },
          ]}
        >
          <WiezLiquidGlassBackdrop
            targetRef={scrollTargetRef}
            onLayout={onScrollTargetLayout}
            style={[
              styles.scrollPanelBackdrop,
              { backgroundColor: scrollLabPalette.stageBg },
            ]}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={styles.scrollInnerList}
            >
              {SCROLL_ROWS.map((rowIndex) => {
                const isAlt = rowIndex % 2 === 0;
                return (
                  <View
                    key={rowIndex}
                    style={[
                      styles.scrollSampleRow,
                      {
                        backgroundColor: isAlt
                          ? scrollLabPalette.tileB
                          : scrollLabPalette.tileA,
                        borderBottomColor: scrollLabPalette.gridAccent,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.scrollRowStripe,
                        {
                          backgroundColor:
                            scrollLabPalette.stripeColors[
                              rowIndex % scrollLabPalette.stripeColors.length
                            ],
                        },
                      ]}
                    />
                    <AppText
                      variant="bodyBold"
                      onDarkStage={stageScheme === 'dark'}
                      onLightStage={stageScheme === 'light'}
                      tone="default"
                    >
                      {`SCROLL LINE 0${rowIndex} · REFRACT EDGE TEST`}
                    </AppText>
                  </View>
                );
              })}
            </ScrollView>
          </WiezLiquidGlassBackdrop>

          {!optical.rawHidden ? (
            <View style={styles.scrollAnchoredOverlay} pointerEvents="none">
              <WiezLiquidGlass
                mode="enhanced"
                tintMode={stageScheme}
                blurTarget={scrollBlurTargetRef}
                borderRadius={tokens.radius.full}
                initialSize={{ width: 200, height: 48 }}
                refraction={optical.refractionEnabled}
                refractionStrength={optical.refractionStrength}
                curvature={optical.curvature}
                opticalThickness={optical.opticalThickness}
                blurRadius={optical.blurRadius}
                fresnelIntensity={optical.fresnelIntensity}
                reflectionIntensity={optical.reflectionIntensity}
                tintAlpha={optical.tintAlpha}
                chromaticAberration={optical.chromaticAberration}
                testID="lab-scroll-pill"
                style={styles.scrollPill}
              >
                <AppText
                  variant="smallBold"
                  onDarkStage={stageScheme === 'dark'}
                  onLightStage={stageScheme === 'light'}
                  tone="default"
                >
                  Scroll Behind Glass
                </AppText>
              </WiezLiquidGlass>
              <WiezLiquidGlass
                mode="enhanced"
                tintMode={stageScheme}
                blurTarget={scrollBlurTargetRef}
                borderRadius={tokens.radius.full}
                initialSize={{ width: 48, height: 48 }}
                refraction={optical.refractionEnabled}
                refractionStrength={optical.refractionStrength}
                curvature={optical.curvature}
                opticalThickness={optical.opticalThickness}
                blurRadius={optical.blurRadius}
                fresnelIntensity={optical.fresnelIntensity}
                reflectionIntensity={optical.reflectionIntensity}
                tintAlpha={optical.tintAlpha}
                chromaticAberration={optical.chromaticAberration}
                testID="lab-scroll-circle"
                style={styles.circle48}
              >
                <SpecimenMenuDots />
              </WiezLiquidGlass>
            </View>
          ) : null}
        </View>

        {/* Optical Calibration Steppers */}
        <AppText variant="sectionTitle">Optical Calibration</AppText>
        <View style={styles.stepperGrid}>
          <ParamStepperRow
            label="Refraction"
            valueText={
              optical.refractionEnabled
                ? optical.refractionStrength.toFixed(2)
                : '0.00 (off)'
            }
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                preset: 'calibrated',
                rawHidden: false,
                refractionEnabled: true,
                refractionStrength: roundTwo(
                  clamp(p.refractionStrength - 0.1, 0, 2),
                ),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                preset: 'calibrated',
                rawHidden: false,
                refractionEnabled: true,
                refractionStrength: roundTwo(
                  clamp(p.refractionStrength + 0.1, 0, 2),
                ),
              }))
            }
          />
          <ParamStepperRow
            label="Curvature"
            valueText={optical.curvature.toFixed(2)}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                curvature: roundTwo(clamp(p.curvature - 0.05, 0, 1)),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                curvature: roundTwo(clamp(p.curvature + 0.05, 0, 1)),
              }))
            }
          />
          <ParamStepperRow
            label="Thickness"
            valueText={optical.opticalThickness.toFixed(2)}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                opticalThickness: roundTwo(
                  clamp(p.opticalThickness - 0.05, 0, 1),
                ),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                opticalThickness: roundTwo(
                  clamp(p.opticalThickness + 0.05, 0, 1),
                ),
              }))
            }
          />
          <ParamStepperRow
            label="Blur (dp)"
            valueText={`${optical.blurRadius.toFixed(0)} dp`}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                blurRadius: roundTwo(clamp(p.blurRadius - 1, 0, 24)),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                blurRadius: roundTwo(clamp(p.blurRadius + 1, 0, 24)),
              }))
            }
          />
          <ParamStepperRow
            label="Fresnel Edge"
            valueText={optical.fresnelIntensity.toFixed(2)}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                fresnelIntensity: roundTwo(
                  clamp(p.fresnelIntensity - 0.1, 0, 1.5),
                ),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                fresnelIntensity: roundTwo(
                  clamp(p.fresnelIntensity + 0.1, 0, 1.5),
                ),
              }))
            }
          />
          <ParamStepperRow
            label="Reflection"
            valueText={optical.reflectionIntensity.toFixed(2)}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                reflectionIntensity: roundTwo(
                  clamp(p.reflectionIntensity - 0.1, 0, 1.5),
                ),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                reflectionIntensity: roundTwo(
                  clamp(p.reflectionIntensity + 0.1, 0, 1.5),
                ),
              }))
            }
          />
          <ParamStepperRow
            label="Tint Alpha"
            valueText={
              optical.tintAlpha === undefined
                ? 'auto (token)'
                : optical.tintAlpha.toFixed(2)
            }
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                tintAlpha: roundTwo(clamp((p.tintAlpha ?? 0.04) - 0.02, 0, 0.6)),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                tintAlpha: roundTwo(clamp((p.tintAlpha ?? 0.02) + 0.02, 0, 0.6)),
              }))
            }
          />
          <ParamStepperRow
            label="Chromatic"
            valueText={optical.chromaticAberration.toFixed(2)}
            onDecrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                chromaticAberration: roundTwo(
                  clamp(p.chromaticAberration - 0.1, 0, 1),
                ),
              }))
            }
            onIncrement={() =>
              setOptical((p) => ({
                ...p,
                rawHidden: false,
                chromaticAberration: roundTwo(
                  clamp(p.chromaticAberration + 0.1, 0, 1),
                ),
              }))
            }
          />
        </View>

        {/* Native Material Engine Diagnostics Readout */}
        <View
          style={[
            styles.diagPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <AppText variant="smallBold">Material Engine Diagnostics</AppText>
          <AppText variant="captionRegular" tone="secondary">
            {`Platform: ${capabilities.platform} API ${capabilities.apiLevel ?? 'n/a'} · Engine v${capabilities.engineVersion}`}
          </AppText>
          <AppText variant="captionRegular" tone="secondary">
            {`RenderEffect Blur: ${capabilities.supportsRenderEffectBlur ? 'YES' : 'NO'} · AGSL RuntimeShader: ${capabilities.supportsRuntimeShader ? 'COMPILED' : 'UNAVAILABLE'}`}
          </AppText>
          {capabilities.shaderCompileError ? (
            <AppText variant="captionRegular" tone="danger">
              {`Shader Error: ${capabilities.shaderCompileError}`}
            </AppText>
          ) : (
            <AppText variant="captionRegular" tone="success">
              {`Shader Compile: Clean · Fallbacks: API 31–32 RenderEffect, API <31 / SurfaceView lightweight rim`}
            </AppText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 2,
  },
  topBarTitleWrap: {
    flex: 1,
    gap: 2,
  },
  topActionChip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
  },
  scrollContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  compactChip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
  },
  stageFrame: {
    height: STAGE_HEIGHT,
    borderRadius: tokens.radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  stageBackdrop: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  patternMotionLayer: {
    position: 'absolute',
    top: -16,
    left: -32,
    right: -32,
    bottom: -16,
  },
  patternFill: {
    width: '100%',
    height: '100%',
  },
  gridTypographyBand: {
    position: 'absolute',
    top: 0,
    left: tokens.spacing['2xl'],
    right: tokens.spacing['2xl'],
    bottom: 0,
    alignItems: 'center',
  },
  gridTextLineTop: {
    position: 'absolute',
    top: 66,
    textAlign: 'center',
  },
  gridTextLineUpperEdge: {
    position: 'absolute',
    top: 96,
    textAlign: 'center',
  },
  gridTextLineLowerEdge: {
    position: 'absolute',
    bottom: 92,
    textAlign: 'center',
  },
  stripeRow: {
    flex: 1,
    flexDirection: 'row',
  },
  stripeCol: {
    flex: 1,
    height: '100%',
  },
  stripeOverlayBars: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  photoTypographyBand: {
    position: 'absolute',
    top: 78,
    left: tokens.spacing['2xl'],
    right: tokens.spacing['2xl'],
    bottom: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specimenOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specimenTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  specimenMidRow: {
    width: '100%',
    alignItems: 'center',
  },
  specimenBottomRow: {
    width: '100%',
    alignItems: 'center',
  },
  circle48: {
    width: 48,
    height: 48,
  },
  circle56: {
    width: 56,
    height: 56,
  },
  pill164: {
    width: 164,
    height: 48,
  },
  largeCard: {
    width: 296,
    height: 104,
    paddingHorizontal: tokens.spacing.lg,
  },
  pillWide: {
    width: 264,
    height: 48,
  },
  scrollPanelFrame: {
    height: SCROLL_PANEL_HEIGHT,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollPanelBackdrop: {
    width: '100%',
    height: '100%',
  },
  scrollInnerList: {
    paddingVertical: tokens.spacing.sm,
  },
  scrollSampleRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    borderBottomWidth: 2,
  },
  scrollRowStripe: {
    width: 20,
    height: 28,
    borderRadius: tokens.radius.xs,
  },
  scrollAnchoredOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  scrollPill: {
    width: 200,
    height: 48,
  },
  stepperGrid: {
    gap: tokens.spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
  },
  stepperLabelCol: {
    flex: 1,
    gap: 2,
  },
  stepperControls: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  stepBtn: {
    width: 40,
    height: 36,
    borderRadius: tokens.radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagPanel: {
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    gap: tokens.spacing.xs,
  },
});
