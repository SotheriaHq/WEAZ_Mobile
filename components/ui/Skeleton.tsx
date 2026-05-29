import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/src/theme/ThemeProvider';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Animated shimmer skeleton placeholder for loading states.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const { theme } = useTheme();
  
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  const backgroundColor = theme.colors.skeletonBase;

  const shimmerColors = ['transparent', theme.colors.skeletonHighlight, 'transparent'];

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={shimmerColors as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Pre-built Skeleton Variants
// ─────────────────────────────────────────────────────────────

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  spacing?: number;
  lastLineWidth?: DimensionValue;
}

/**
 * Multi-line text skeleton
 */
export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  spacing = 10,
  lastLineWidth = '60%',
}: SkeletonTextProps) {
  return (
    <View style={{ gap: spacing }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          height={lineHeight}
          borderRadius={6}
        />
      ))}
    </View>
  );
}

/**
 * Avatar/Profile picture skeleton
 */
export function SkeletonAvatar({ size = 48 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

/**
 * Card skeleton for feed items, products, etc.
 */
export function SkeletonCard() {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.skeletonBase,
          borderColor: theme.colors.controlSurfaceActive,
        },
      ]}
    >
      {/* Image placeholder */}
      <Skeleton width="100%" height={200} borderRadius={12} />
      
      <View style={styles.cardContent}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <SkeletonAvatar size={36} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={14} borderRadius={6} />
            <Skeleton width="30%" height={10} borderRadius={4} />
          </View>
        </View>

        {/* Title */}
        <Skeleton width="80%" height={18} borderRadius={6} style={{ marginTop: 12 }} />
        
        {/* Description */}
        <SkeletonText lines={2} lineHeight={12} spacing={8} lastLineWidth="70%" />
        
        {/* Actions row */}
        <View style={styles.cardActions}>
          <Skeleton width={60} height={24} borderRadius={12} />
          <Skeleton width={60} height={24} borderRadius={12} />
          <Skeleton width={40} height={24} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

/**
 * Post/Feed item skeleton (TikTok style)
 */
export function SkeletonPost() {
  const { theme } = useTheme();

  return (
    <View style={styles.postContainer}>
      {/* Full image skeleton */}
      <Skeleton width="100%" height={450} borderRadius={0} />
      
      {/* Overlay content */}
      <View style={styles.postOverlay}>
        {/* Right side actions */}
        <View style={styles.postActions}>
          <SkeletonAvatar size={44} />
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <Skeleton width={32} height={32} borderRadius={16} />
            <Skeleton width={32} height={32} borderRadius={16} />
          </View>
        </View>

        {/* Bottom info */}
        <View style={styles.postInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SkeletonAvatar size={40} />
            <Skeleton width={120} height={16} borderRadius={6} />
          </View>
          <Skeleton width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
          <Skeleton width="50%" height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

/**
 * Product card skeleton for shop/store
 */
export function SkeletonProductCard() {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.productCard,
        {
          backgroundColor: theme.colors.controlSurface,
          borderColor: theme.colors.controlSurfaceActive,
        },
      ]}
    >
      <Skeleton width="100%" height={160} borderRadius={12} />
      <View style={styles.productContent}>
        <Skeleton width="75%" height={16} borderRadius={6} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Skeleton width={60} height={20} borderRadius={6} />
          <Skeleton width={40} height={14} borderRadius={4} />
        </View>
        <Skeleton width="40%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

/**
 * Notification item skeleton
 */
export function SkeletonNotification() {
  return (
    <View style={styles.notificationItem}>
      <SkeletonAvatar size={44} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="80%" height={14} borderRadius={6} />
        <Skeleton width="60%" height={12} borderRadius={4} />
      </View>
    </View>
  );
}

/**
 * List of skeleton items
 */
export function SkeletonList({
  count = 3,
  ItemComponent = SkeletonCard,
  gap = 16,
}: {
  count?: number;
  ItemComponent?: React.ComponentType;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <ItemComponent key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardContent: {
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  postContainer: {
    width: '100%',
    height: 450,
    position: 'relative',
  },
  postOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 80,
  },
  postActions: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    alignItems: 'center',
    gap: 20,
  },
  postInfo: {
    position: 'absolute',
    left: 16,
    right: 80,
    bottom: 20,
  },
  productCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    width: '48%',
  },
  productContent: {
    padding: 12,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
