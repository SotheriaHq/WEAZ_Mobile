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

/**
 * The one width every profile dropdown in the app uses.
 *
 * Studio's menu sized itself from the viewport (`round(width * 0.46)`, clamped
 * to 180–196) while the catalog header's used this component's flat 190 — so on
 * a 390pt phone the same menu was 180pt in Studio and 190pt in the catalog, and
 * the two screens visibly disagreed about how wide a profile menu is. The
 * viewport-relative rule is the better of the two (it holds its proportion on a
 * small phone and on a tablet), so it moves here and both callers read it.
 */
export const PROFILE_MENU_MIN_WIDTH = 180;
export const PROFILE_MENU_MAX_WIDTH = 196;

export function getProfileMenuWidth(windowWidth: number): number {
  const available = Math.max(
    PROFILE_MENU_MIN_WIDTH,
    windowWidth - tokens.spacing.lg * 2,
  );
  return Math.min(
    Math.max(PROFILE_MENU_MIN_WIDTH, Math.round(windowWidth * 0.46)),
    Math.min(PROFILE_MENU_MAX_WIDTH, available),
  );
}

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
  const minLeft = 12;
  const maxLeft = Math.max(minLeft, windowWidth - menuWidth - 12);
  const preferredLeft = pageX + width - menuWidth + tokens.spacing.xs;

  return {
    top: pageY + height + 20, // Aligned below the trigger with a small gap
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
    return 190; // Fixed WhatsApp standard menu dropdown width
  }, [width]);

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
            isInteraction: false,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            speed: 20,
            bounciness: 2,
            useNativeDriver: true,
            isInteraction: false,
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
        isInteraction: false,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 140,
        useNativeDriver: true,
        isInteraction: false,
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
            top: resolvedPosition.top,
            left: resolvedPosition.left,
            width: menuWidth,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            // WhatsApp shadow style
            shadowColor: tokens.colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.16,
            shadowRadius: 8,
            elevation: 8,
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
                // Same row rhythm as the Studio profile menu: a hairline rule
                // between entries so each link reads as its own target rather
                // than one undivided block of text. The last row is left open so
                // the rule never doubles up with the panel's own edge.
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                isFirst && { borderTopLeftRadius: 11, borderTopRightRadius: 11 },
                isLast && { borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
                pressed && {
                  backgroundColor: theme.colors.primarySoft,
                },
                pressed && styles.optionPressed,
                option.disabled && styles.optionDisabled,
              ]}
              onPress={() => handleOptionPress(option.onPress)}
            >
              {option.icon ? <AppText variant="body">{option.icon}</AppText> : null}
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
    borderWidth: 0,
    borderRadius: 12,
    paddingVertical: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
