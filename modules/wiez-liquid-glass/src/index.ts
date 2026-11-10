import type React from 'react';
import {
  Platform,
  processColor,
  type ViewProps,
} from 'react-native';
import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from 'expo-modules-core';

type NativeModuleShape = {
  supportsRuntimeShader?: boolean;
  supportsRenderEffectBlur?: boolean;
  shaderCompileError?: string | null;
  engineVersion?: number;
};

export type NativeWiezLiquidGlassBackdropProps = ViewProps & {
  ref?: React.Ref<any>;
};

export type NativeWiezLiquidGlassLensProps = ViewProps & {
  targetViewId?: number;
  cornerRadius?: number;
  blurRadius?: number;
  refractionStrength?: number;
  chromaticAberration?: number;
  rimStrength?: number;
  reflectionStrength?: number;
  curvature?: number;
  opticalThickness?: number;
  tintColor?: number;
  tintAlpha?: number;
  fallbackColor?: number;
  isDark?: boolean;
  pressed?: boolean;
};

let cachedChecked = false;
let cachedModule: NativeModuleShape | null = null;
let cachedBackdropView: React.ComponentType<NativeWiezLiquidGlassBackdropProps> | null = null;
let cachedLensView: React.ComponentType<NativeWiezLiquidGlassLensProps> | null = null;

function ensureNativeLoaded(): void {
  if (cachedChecked) return;
  cachedChecked = true;
  if (Platform.OS !== 'android') return;

  try {
    const mod = requireOptionalNativeModule<NativeModuleShape>('WiezLiquidGlass');
    if (!mod) return;
    cachedModule = mod;
    cachedBackdropView = requireNativeViewManager<NativeWiezLiquidGlassBackdropProps>(
      'WiezLiquidGlass',
      'WiezLiquidGlassBackdropView',
    );
    cachedLensView = requireNativeViewManager<NativeWiezLiquidGlassLensProps>(
      'WiezLiquidGlass',
      'WiezLiquidGlassLensView',
    );
  } catch {
    cachedModule = null;
    cachedBackdropView = null;
    cachedLensView = null;
  }
}

export function isWiezLiquidGlassNativeAvailable(): boolean {
  ensureNativeLoaded();
  return Boolean(cachedModule && cachedBackdropView && cachedLensView);
}

export function supportsWiezLiquidGlassRefraction(): boolean {
  ensureNativeLoaded();
  return Boolean(cachedModule?.supportsRuntimeShader);
}

export function supportsWiezLiquidGlassRenderEffectBlur(): boolean {
  ensureNativeLoaded();
  return Boolean(cachedModule?.supportsRenderEffectBlur);
}

export function getWiezLiquidGlassDiagnostics() {
  ensureNativeLoaded();
  return {
    nativeAvailable: Boolean(cachedModule && cachedBackdropView && cachedLensView),
    supportsRuntimeShader: Boolean(cachedModule?.supportsRuntimeShader),
    supportsRenderEffectBlur: Boolean(cachedModule?.supportsRenderEffectBlur),
    shaderCompileError: cachedModule?.shaderCompileError ?? null,
    engineVersion: cachedModule?.engineVersion ?? null,
  };
}

export function getWiezLiquidGlassBackdropNativeView():
  | React.ComponentType<NativeWiezLiquidGlassBackdropProps>
  | null {
  ensureNativeLoaded();
  return cachedBackdropView;
}

export function getWiezLiquidGlassLensNativeView():
  | React.ComponentType<NativeWiezLiquidGlassLensProps>
  | null {
  ensureNativeLoaded();
  return cachedLensView;
}

export function toAndroidColorInt(color: string | undefined, fallbackInt = 0): number {
  if (!color) return fallbackInt;
  const processed = processColor(color);
  return typeof processed === 'number' ? processed | 0 : fallbackInt;
}
