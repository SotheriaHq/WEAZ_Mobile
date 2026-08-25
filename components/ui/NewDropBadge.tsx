import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { NEW_DROP_BADGE_RULE, getNewDropInfo } from '@/src/engagement/newDrop';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type NewDropBadgeProps = {
  itemId: string;
  createdAt?: string | null;
  sourceScreen: string;
  feedPosition?: number;
  isActive?: boolean;
  style?: StyleProp<ViewStyle>;
};

const dismissedSessionItems = new Set<string>();

export function NewDropBadge({
  itemId,
  createdAt,
  sourceScreen,
  feedPosition,
  isActive = false,
  style,
}: NewDropBadgeProps) {
  const { theme } = useTheme();
  const trackedKeyRef = useRef<string | null>(null);
  const info = getNewDropInfo(createdAt);
  const [dismissed, setDismissed] = useState(() => dismissedSessionItems.has(itemId));
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      dismissedSessionItems.add(itemId);
      setDismissed(true);
    }
    wasActiveRef.current = isActive;
  }, [isActive, itemId]);

  useEffect(() => {
    if (!info.isNewDrop) return;
    const key = `${sourceScreen}:${itemId}:${NEW_DROP_BADGE_RULE}`;
    if (trackedKeyRef.current === key) return;
    trackedKeyRef.current = key;
    trackMobileEvent('new_drop_badge_seen', {
      sourceScreen,
      itemId,
      badgeRule: NEW_DROP_BADGE_RULE,
      ageHours: info.ageHours ?? undefined,
      feedPosition,
    });
  }, [feedPosition, info.ageHours, info.isNewDrop, itemId, sourceScreen]);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!info.isNewDrop || dismissed) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        // `Animated.delay` defaults to `isInteraction: true` and has no
        // opt-out. Hold the pose with a no-op timing instead so this loop
        // cannot stall `useDeferredScreenWork`.
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ])
    ).start();
  }, [info.isNewDrop, pulseAnim, dismissed]);

  if (!info.isNewDrop || dismissed) return null;

  /*
    A word, not a plate.

    The badge was a bordered pill with horizontal padding, and on a market card
    it was ALSO constrained to `maxWidth: '18%'` of the card. On a two-up grid
    that is roughly 30pt, of which the padding took most — so the pill rendered
    at full opacity with its label squeezed to nothing. The reported symptom was
    exactly that: cards carrying the new-drop marker with no text in it.

    Widening the cap would have fixed the clipping and left a chip pasted over
    the artwork, competing with the price panel and the bag action for the same
    corner of a photograph the card exists to show. The plate was never carrying
    meaning — "NEW!" is the whole message, and set bold over the image it reads
    at a glance without taking a rectangle out of the picture.

    Legibility over an arbitrary photo comes from a text shadow rather than a
    fill. `textShadow*` is one of the sanctioned `AppText` style overrides (only
    typography and colour are forbidden), and it is the same technique the
    content viewer's bare dock glyphs use.
  */
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.badge, { transform: [{ scale: pulseAnim }] }, style]}
    >
      <AppText
        variant="captionBold"
        tone="inverse"
        numberOfLines={1}
        style={styles.label}
      >
        NEW!
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.6,
    textShadowColor: tokens.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default NewDropBadge;
