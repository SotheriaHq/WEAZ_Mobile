import React from 'react';
import { router } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton, type IconButtonVariant } from '@/components/ui/IconButton';
import { navPerf } from '@/src/utils/navPerf';

type Props = {
  onPress?: () => void;
  fallbackHref?: string;
  label?: string;
  emoji?: string;
  variant?: IconButtonVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function AppBackButton({
  onPress,
  fallbackHref,
  label = 'Go back',
  emoji = '👈',
  variant = 'ghost',
  size = 44,
  style,
}: Props) {
  const pendingRouteFrameRef = React.useRef<number | null>(null);

  const cancelPendingRouteFrame = React.useCallback(() => {
    if (pendingRouteFrameRef.current === null) return;
    cancelAnimationFrame(pendingRouteFrameRef.current);
    pendingRouteFrameRef.current = null;
  }, []);

  const scheduleBackRouteAfterFrame = React.useCallback((run: () => void) => {
    // Defer one frame so the pressed feedback paints before navigating — keeps the
    // back tap feeling instant. Single rAF (decoupled, not synchronous, not two
    // frames).
    cancelPendingRouteFrame();
    pendingRouteFrameRef.current = requestAnimationFrame(() => {
      pendingRouteFrameRef.current = null;
      navPerf.frameYieldBeforeRoute('back');
      navPerf.navigationCalled('back');
      run();
    });
  }, [cancelPendingRouteFrame]);

  React.useEffect(() => cancelPendingRouteFrame, [cancelPendingRouteFrame]);

  return (
    <IconButton
      size={size}
      variant={variant}
      style={style}
      onPress={() => {
        navPerf.tap('back');
        if (onPress) {
          onPress();
          return;
        }
        if (router.canGoBack()) {
          scheduleBackRouteAfterFrame(() => router.back());
          return;
        }
        if (fallbackHref) {
          // navigate (not replace) so the top-level fallback reuses its warm
          // instance instead of being remounted and refetched on return.
          scheduleBackRouteAfterFrame(() => router.navigate(fallbackHref as any));
        }
      }}
      testID="app-back-button"
    >
      <AppText variant="subtitle" accessibilityLabel={label}>
        {emoji}
      </AppText>
    </IconButton>
  );
}

export default AppBackButton;
