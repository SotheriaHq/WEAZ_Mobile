import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { tokens } from '@/src/styles/tokens';

export const THREAD_SOCIAL_PROOF_THRESHOLD = 3;
const SOCIAL_PROOF_GLASS_SIZE = { width: 172, height: 28 } as const;

type SocialProofPillProps = {
  itemId: string;
  mediaId?: string | null;
  threadCount: number;
  sourceScreen: string;
  feedPosition?: number;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
};

const toCompactCount = (value: number) => {
  if (value < 1000) return String(value);
  if (value < 1000000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}m`;
};

export function getThreadSocialProofLabel(threadCount: number) {
  if (threadCount < THREAD_SOCIAL_PROOF_THRESHOLD) return null;
  return `${toCompactCount(threadCount)} people threaded this`;
}

export function SocialProofPill({
  itemId,
  mediaId,
  threadCount,
  sourceScreen,
  feedPosition,
  visible = true,
  style,
}: SocialProofPillProps) {
  const trackedKeyRef = useRef<string | null>(null);
  const label = getThreadSocialProofLabel(threadCount);

  useEffect(() => {
    if (!visible || !label) return;
    const key = `${sourceScreen}:${itemId}:${mediaId ?? 'item'}:${threadCount}`;
    if (trackedKeyRef.current === key) return;
    trackedKeyRef.current = key;
    trackMobileEvent('social_proof_seen', {
      sourceScreen,
      itemId,
      mediaId,
      proofType: 'threads',
      countValue: threadCount,
      threshold: THREAD_SOCIAL_PROOF_THRESHOLD,
      feedPosition,
    });
  }, [feedPosition, itemId, label, mediaId, sourceScreen, threadCount, visible]);

  if (!visible || !label) return null;

  return (
    <WiezLiquidGlass
      mode="lightweight"
      intensity="prominent"
      tintMode="dark"
      tintAlpha={tokens.liquidGlass.fallbackTint.mediaPill}
      borderRadius={tokens.radius.md}
      initialSize={SOCIAL_PROOF_GLASS_SIZE}
      pointerEvents="none"
      style={[styles.pill, style]}
      contentStyle={styles.pillContent}
    >
      <AppText variant="captionBold" tone="inverse">
        {label}
      </AppText>
    </WiezLiquidGlass>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: tokens.radius.md,
    borderWidth: 0,
  },
  pillContent: {
    minHeight: 28,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SocialProofPill;
