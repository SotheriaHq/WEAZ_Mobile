import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useAnimatedKeyboard,
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
  children: React.ReactNode | (() => React.ReactNode);
  onClose: () => void;
  showCloseButton?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  loading?: boolean;
  scrollable?: boolean;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardBehavior?: 'auto' | 'none';
  onDismiss?: () => void;
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
  keyboardBehavior = 'auto',
  onDismiss,
}: Props) {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(28);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = useState(
    visible && (keyboardBehavior !== 'none' || !Keyboard.isVisible()),
  );
  const onDismissRef = useRef(onDismiss);
  const keyboardFallbackHeight = useSharedValue(0);
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const isDark = scheme === 'dark';
  const sheetPaddingBottom = Math.max(tokens.spacing.lg, insets.bottom + tokens.spacing.sm);

  useAndroidOverlaySystemBars(visible, scheme, 'bottom-sheet');

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const finishDismiss = React.useCallback(() => {
    setMounted(false);
    onDismissRef.current?.();
  }, []);

  const dragCloseResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          const nextY = Math.max(0, gestureState.dy);
          translateY.value = nextY;
          opacity.value = Math.max(0.62, 1 - nextY / 420);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 48 || gestureState.vy > 0.8) {
            Keyboard.dismiss();
            onClose();
            return;
          }
          translateY.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.cubic) });
          opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) });
        },
        onPanResponderTerminate: () => {
          translateY.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.cubic) });
          opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) });
        },
      }),
    [onClose, opacity, translateY],
  );

  useEffect(() => {
    if (!visible) return;

    if (keyboardBehavior !== 'none' || !Keyboard.isVisible()) {
      setMounted(true);
      return;
    }

    Keyboard.dismiss();
    const hiddenSubscription = Keyboard.addListener('keyboardDidHide', () => setMounted(true));
    const fallbackTimer = setTimeout(() => setMounted(true), 320);

    return () => {
      hiddenSubscription.remove();
      clearTimeout(fallbackTimer);
    };
  }, [keyboardBehavior, visible]);

  useEffect(() => {
    if (!visible || keyboardBehavior !== 'auto') {
      keyboardFallbackHeight.value = withTiming(0, { duration: 120 });
      return;
    }

    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardFallbackHeight.value = withTiming(event.endCoordinates.height, { duration: 120 });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardFallbackHeight.value = withTiming(0, { duration: 120 });
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardBehavior, keyboardFallbackHeight, visible]);

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
          runOnJS(finishDismiss)();
        }
      });
    }
  }, [finishDismiss, mounted, opacity, translateY, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const keyboardWrapStyle = useAnimatedStyle(() => ({
    paddingBottom:
      keyboardBehavior === 'auto'
        ? Math.max(keyboard.height.value, keyboardFallbackHeight.value)
        : 0,
  }));

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled' as const,
        keyboardDismissMode: 'interactive' as const,
        // keyboard avoidance is handled smoothly by our animated wrap; don't double count
        automaticallyAdjustKeyboardInsets: false,
        contentContainerStyle: [
          styles.bodyContent,
          keyboardBehavior === 'auto' ? styles.bodyContentKeyboard : null,
        ],
      }
    : { style: [styles.bodyContent, { flexShrink: 1 }] };

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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        >
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: theme.colors.backdrop }]} />
        </Pressable>
        <Animated.View style={[styles.keyboardWrap, keyboardWrapStyle]}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.bottomSheetSurface,
                borderColor: theme.colors.border,
                paddingBottom: sheetPaddingBottom,
              },
              sheetStyle,
              style,
            ]}
          >
            <View {...dragCloseResponder.panHandlers} style={styles.dragArea}>
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
                      <AppText variant="subtitle" tone="muted">X</AppText>
                    </Pressable>
                  ) : null}
                </View>
                </View>
              ) : null}
            </View>

            <Body {...bodyProps}>{typeof children === 'function' ? children() : children}</Body>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </Animated.View>
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
  sheetKeyboardOpen: {
    // Lifted by KeyboardAvoidingView padding; allow it to fill the remaining space above the keyboard
    maxHeight: '100%',
  },
  handle: {
    width: 46,
    height: 4,
    borderRadius: tokens.radius.full,
    alignSelf: 'center',
  },
  dragArea: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xs,
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
  bodyContentKeyboard: {
    paddingBottom: tokens.spacing.lg,
  },
  footer: {
    paddingTop: tokens.spacing.sm,
  },
});

export default AppBottomSheet;
