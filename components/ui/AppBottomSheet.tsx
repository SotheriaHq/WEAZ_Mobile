import React, { useEffect, useState } from 'react';
import {
  Keyboard,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isDark = scheme === 'dark';
  const sheetPaddingBottom = keyboardHeight > 0
    ? tokens.spacing.lg
    : Math.max(tokens.spacing.lg, insets.bottom + tokens.spacing.sm);

  useAndroidOverlaySystemBars(visible, scheme, 'bottom-sheet');

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
        keyboardDismissMode: 'interactive' as const,
        // KeyboardAvoidingView already lifts the sheet; don't also inset the
        // ScrollView content on iOS or the avoidance double-counts.
        automaticallyAdjustKeyboardInsets: false,
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
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: theme.colors.backdrop }]} />
        </Pressable>
        <KeyboardAvoidingView
          // React Native modal KeyboardAvoidingView bug on Android:
          // A React Native <Modal> is hosted in its own Dialog window that does NOT inherit the
          // activity's adjustResize. However, KeyboardAvoidingView padding calculations often leave
          // ghost padding behind when closed. So we apply manual paddingBottom via state instead on Android.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.keyboardWrap, Platform.OS === 'android' && { paddingBottom: keyboardHeight }]}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.bottomSheetSurface,
                borderColor: theme.colors.border,
                paddingBottom: sheetPaddingBottom,
              },
              // While the keyboard is open, shrink the max height so the lifted
              // sheet cannot run off the top of the screen and the body ScrollView
              // can reach the focused input + Add button.
              keyboardHeight > 0 ? styles.sheetKeyboardOpen : null,
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

            <Body {...bodyProps}>{typeof children === 'function' ? children() : children}</Body>

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
