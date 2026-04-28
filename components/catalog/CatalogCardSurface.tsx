import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';

import { StableImage } from '@/components/ui/StableImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useMediaAspectRatio } from '@/src/hooks/useMediaAspectRatio';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

type CatalogCardSurfaceProps = {
  width?: number | `${number}%` | 'auto';
  onPress?: () => void;
  disabled?: boolean;
  mediaSrc?: string | null;
  mediaFileId?: string | null;
  mediaAspectRatio?: number | null;
  mediaResizeMode?: ImageResizeMode;
  topOverlay?: React.ReactNode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
};

export function CatalogCardSurface({
  width,
  onPress,
  disabled = false,
  mediaSrc,
  mediaFileId,
  mediaAspectRatio,
  mediaResizeMode = 'cover',
  topOverlay,
  fallback,
  children,
  style,
  bodyStyle,
}: CatalogCardSurfaceProps) {
  const { theme, scheme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isDark = scheme === 'dark';
  const resolvedUri = useResolvedImageUri({
    src: mediaSrc,
    fileId: mediaFileId,
    enabled: Boolean(mediaSrc || mediaFileId),
  });
  const aspectRatio = useMediaAspectRatio(resolvedUri, mediaAspectRatio);

  const animateTo = useCallback(
    (value: number) => {
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: true,
        damping: 18,
        stiffness: 240,
        mass: 0.9,
      }).start();
    },
    [scale],
  );

  return (
    <Animated.View
      style={[
        {
          width,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled && onPress) {
            animateTo(0.985);
          }
        }}
        onPressOut={() => animateTo(1)}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.colors.surface,
            borderColor: theme.colors.border,
          },
          style,
        ]}
      >
        <View style={styles.mediaClip}>
          <View style={[styles.mediaWrap, { aspectRatio }]}>
            {resolvedUri ? (
              <StableImage
                uri={resolvedUri}
                resizeMode={mediaResizeMode}
                containerStyle={styles.mediaFill}
                imageStyle={styles.mediaFill}
                fadeDuration={150}
              />
            ) : (
              fallback
            )}
            {topOverlay ? (
              <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                {topOverlay}
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.body, bodyStyle]}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
  },
  mediaClip: {
    overflow: 'hidden',
  },
  mediaWrap: {
    width: '100%',
    position: 'relative',
  },
  mediaFill: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  body: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
});

export default CatalogCardSurface;
