import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  showCloseButton?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  loading?: boolean;
  scrollable?: boolean;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppBottomSheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
  showCloseButton = false,
  onDone,
  doneLabel = 'Done',
  doneDisabled,
  loading,
  scrollable = true,
  footer,
  style,
}: Props) {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(28);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  const isDark = scheme === 'dark';
  const androidBottomGap = Platform.OS === 'android' ? Math.max(0, insets.bottom) : 0;
  const sheetPaddingBottom =
    Platform.OS === 'android'
      ? tokens.spacing.lg
      : Math.max(tokens.spacing.lg, insets.bottom + tokens.spacing.sm);

  useAndroidOverlaySystemBars(visible, scheme, 'bottom-sheet');

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      translateY.value = 28;
      opacity.value = 0;
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = withTiming(28, { duration: 180, easing: Easing.in(Easing.cubic) });
      opacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      });
    }
  }, [mounted, opacity, translateY, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled' as const,
        contentContainerStyle: styles.bodyContent,
      }
    : { style: styles.bodyContent };

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView
              tint={isDark ? 'dark' : 'light'}
              intensity={Platform.OS === 'android' ? 24 : 38}
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.backdrop }]}
            />
          </Animated.View>
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrap}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.bottomSheetSurface,
                borderColor: theme.colors.border,
                marginBottom: androidBottomGap,
                paddingBottom: sheetPaddingBottom,
              },
              sheetStyle,
              style,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: theme.colors.bottomSheetHandle }]} />

            {(title || subtitle || onDone) ? (
              <View style={styles.header}>
                <View style={styles.titleWrap}>
                  {title ? <AppText variant="title">{title}</AppText> : null}
                  {subtitle ? <AppText variant="body" tone="muted">{subtitle}</AppText> : null}
                </View>
                <View style={styles.headerActions}>
                  {onDone ? (
                    <Button
                      title={doneLabel}
                      size="sm"
                      variant="secondary"
                      onPress={onDone}
                      disabled={doneDisabled}
                      loading={loading}
                      style={styles.doneButton}
                    />
                  ) : null}
                  {showCloseButton ? (
                    <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
                      <AppText variant="subtitle" tone="muted">✕</AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Body {...bodyProps}>{children}</Body>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  handle: {
    width: 46,
    height: 4,
    borderRadius: tokens.radius.full,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  titleWrap: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  doneButton: {
    minWidth: 78,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  bodyContent: {
    gap: tokens.spacing.md,
  },
  footer: {
    paddingTop: tokens.spacing.sm,
  },
});

export default AppBottomSheet;
