import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

/** The Runway stage is dark in both themes, so its accent is the dark palette's. */
const STAGE_ACCENT = tokens.themes.dark.colors.primary;
const UNDERLINE_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };

type RunwayFeedTabProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * One Runway feed tab, drawn like the tabs over Reels: words on the video, no
 * plate behind them.
 *
 * The chips this replaces were glass pills, and the selected one used the
 * strong `brand` tint, which read as a heavier slab of colour over the artwork
 * than the island's own active indicator. Here an inactive tab is white with a
 * shadow (legible on any photograph, nothing painted onto it), and the active
 * one takes the system colour with an underline in the same colour. The type
 * is 17/700 so the colour change reads at a glance.
 *
 * The underline is always laid out and only its opacity and width animate, so
 * switching tabs never moves a neighbour.
 */
export const RunwayFeedTab = React.memo(function RunwayFeedTab({
  label,
  selected,
  onPress,
}: RunwayFeedTabProps) {
  const progress = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, UNDERLINE_TIMING);
  }, [progress, selected]);

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.4 + progress.value * 0.6 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <AppText
        variant="actionLabel"
        tone={selected ? 'primary' : 'default'}
        onDarkStage
        numberOfLines={1}
        style={styles.label}
      >
        {label}
      </AppText>
      <View style={styles.underlineTrack} pointerEvents="none">
        <Animated.View style={[styles.underline, underlineStyle]} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tab: {
    minHeight: 44,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'stretch',
    flexShrink: 0,
  },
  tabPressed: {
    opacity: 0.72,
  },
  label: {
    textAlign: 'center',
    // The only thing between white type and a white photograph.
    textShadowColor: tokens.scrim(0.7),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  underlineTrack: {
    height: 3,
    marginTop: 4,
  },
  underline: {
    flex: 1,
    borderRadius: tokens.radius.full,
    backgroundColor: STAGE_ACCENT,
  },
});
