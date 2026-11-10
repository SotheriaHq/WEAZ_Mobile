import { isWiezDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

/**
 * Gates the isolated Liquid Glass Optical Validation & Calibration Lab so it is
 * reachable ONLY in development and preview builds (`EXPO_PUBLIC_DEBUG_NAV=1`)
 * and completely hidden/blocked in production store binaries.
 */
export function isLiquidGlassLabEnabled(): boolean {
  return __DEV__ || isWiezDebugEnabled('nav');
}
