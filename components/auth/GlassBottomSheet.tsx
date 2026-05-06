import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GlassBottomSheetProps {
  children: React.ReactNode;
  /** Height as percentage of screen (0-1). Default 0.68 */
  heightRatio?: number;
  /** Show drag handle indicator */
  showHandle?: boolean;
  /** Enable scroll inside the sheet */
  scrollable?: boolean;
}

export function GlassBottomSheet({
  children,
  heightRatio = 0.68,
  showHandle = true,
  scrollable = true,
}: GlassBottomSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT * heightRatio)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide up animation
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const sheetHeight = SCREEN_HEIGHT * heightRatio;

  const ContentWrapper = scrollable ? ScrollView : View;
  const contentProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        contentContainerStyle: [
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ],
        keyboardShouldPersistTaps: 'handled' as const,
      }
    : {};

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: sheetHeight,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            shadowColor: theme.colors.backdropStrong,
          },
        ]}
      >
        <View style={[styles.topGradientLine, { backgroundColor: theme.colors.primary }]} />

        {/* Drag handle */}
        {showHandle && (
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
        )}

        {/* Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kavContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ContentWrapper style={styles.content} {...contentProps}>
            {children}
          </ContentWrapper>
        </KeyboardAvoidingView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  topGradientLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 8,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  kavContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
