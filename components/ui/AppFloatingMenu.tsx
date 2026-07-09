import React, { useEffect, useMemo, useState, useRef } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View, Animated, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

export type FloatingMenuOption = {
  key: string;
  icon?: string;
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  anchorRef: React.RefObject<any>;
  anchorMetrics?: {
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null;
  options: FloatingMenuOption[];
  onClose: () => void;
  /** Optional menu width override. By default the dropdown fits its longest label. */
  width?: number;
};

function resolveMenuPosition({
  pageX,
  pageY,
  width,
  height,
  menuWidth,
  windowWidth,
}: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  menuWidth: number;
  windowWidth: number;
}) {
  const minLeft = tokens.spacing.md;
  const maxLeft = Math.max(minLeft, windowWidth - menuWidth - tokens.spacing.md);
  const preferredLeft = pageX + width - menuWidth + tokens.spacing.xs;

  return {
    top: pageY + height + 12,
    left: Math.min(Math.max(preferredLeft, minLeft), maxLeft),
  };
}

export function AppFloatingMenu({ visible, anchorRef, anchorMetrics, options, onClose, width }: Props) {
  const { scheme, theme } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [internalVisible, setInternalVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const menuWidth = useMemo(() => {
    if (width) return width;
    const longestTitleLength = options.reduce((longest, option) => Math.max(longest, option.title.length), 0);
    const hasIcons = options.some((option) => Boolean(option.icon));
    const estimatedContentWidth = longestTitleLength * 8 + tokens.spacing.md * 2 + (hasIcons ? 32 : 0);
    return Math.min(Math.max(estimatedContentWidth, 132), windowWidth - tokens.spacing.md * 2);
  }, [options, width, windowWidth]);

  const resolvedPosition = anchorMetrics
    ? resolveMenuPosition({ ...anchorMetrics, menuWidth, windowWidth })
    : { top: windowHeight / 2 - 100, left: windowWidth / 2 - menuWidth / 2 };

  useAndroidOverlaySystemBars(internalVisible, scheme, 'floating-menu');

  useEffect(() => {
    if (visible) {
      if (!internalVisible) {
        setInternalVisible(true);
        setIsClosing(false);
        
        fadeAnim.setValue(0);
        scaleAnim.setValue(0.95);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            speed: 20,
            bounciness: 2,
            useNativeDriver: true,
          })
        ]).start();
      }
    } else {
      if (internalVisible && !isClosing) {
        handleClose();
      }
    }
    // Only react to the parent's `visible` prop changing.
    // internalVisible and isClosing are managed internally and should not trigger re-evaluations that reset state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!internalVisible) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => backHandler.remove();
  }, [internalVisible]);

  const handleClose = (afterClose?: () => void) => {
    if (isClosing) return;
    setIsClosing(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 140,
        useNativeDriver: true,
      })
    ]).start(() => {
      setInternalVisible(false);
      setIsClosing(false);
      onClose(); // notify parent
      afterClose?.();
    });
  };

  const handleOptionPress = (optionOnPress: () => void) => {
    if (isClosing) return;
    // Navigate / act first — do NOT wait for InteractionManager. Waiting for
    // "after interactions" was a multi-second stall when Runway/catalog
    // animations or gesture handlers were still settling. Close the menu as a
    // side effect so the destination paints immediately.
    optionOnPress();
    handleClose();
  };

  if (!internalVisible) return null;

  return (
    <Modal
      transparent
      visible={internalVisible}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => handleClose()}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => handleClose()}>
        <Animated.View 
          style={[
            StyleSheet.absoluteFill, 
            { 
              backgroundColor: 'transparent',
              // Opacity isn't strictly necessary for transparent, but keeping it to match the view structure
              opacity: fadeAnim 
            }
          ]} 
        />
      </Pressable>
      <Animated.View
        style={[
          styles.menu,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            top: resolvedPosition.top,
            left: resolvedPosition.left,
            width: menuWidth,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            ...tokens.elevation.md,
          },
        ]}
      >
        {options.map((option, index) => {
          const isFirst = index === 0;
          const isLast = index === options.length - 1;

          return (
            <Pressable
              key={option.key}
              disabled={isClosing || option.disabled}
              style={({ pressed }) => [
                styles.option,
                isFirst && { borderTopLeftRadius: tokens.radius.lg - 1, borderTopRightRadius: tokens.radius.lg - 1 },
                isLast && { borderBottomLeftRadius: tokens.radius.lg - 1, borderBottomRightRadius: tokens.radius.lg - 1 },
                pressed && {
                  backgroundColor: theme.colors.primarySoft,
                },
                pressed && styles.optionPressed,
                option.disabled && styles.optionDisabled,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
              ]}
              onPress={() => handleOptionPress(option.onPress)}
            >
              {option.icon ? <AppText variant="body" tone="muted">{option.icon}</AppText> : null}
              <AppText variant="body" numberOfLines={2} style={styles.optionTitle}>{option.title}</AppText>
            </Pressable>
          );
        })}
      </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    minWidth: 132,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionDisabled: {
    opacity: 0.48,
  },
  optionTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
});

export default AppFloatingMenu;
