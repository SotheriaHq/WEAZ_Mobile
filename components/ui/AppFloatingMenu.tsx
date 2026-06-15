import React, { useEffect, useState, useRef } from 'react';
import { BackHandler, Dimensions, Modal, Pressable, StyleSheet, View, Animated, InteractionManager } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

export type FloatingMenuOption = {
  key: string;
  icon: string;
  title: string;
  onPress: () => void;
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
};

function resolveMenuPosition({
  pageX,
  pageY,
  width,
  height,
  menuWidth,
}: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  menuWidth: number;
}) {
  const windowWidth = Dimensions.get('window').width;
  const minLeft = tokens.spacing.md;
  const maxLeft = Math.max(minLeft, windowWidth - menuWidth - tokens.spacing.md);
  const preferredLeft = pageX + width - menuWidth + tokens.spacing.xs;

  return {
    top: pageY + height + 2,
    left: Math.min(Math.max(preferredLeft, minLeft), maxLeft),
  };
}

export function AppFloatingMenu({ visible, anchorRef, anchorMetrics, options, onClose }: Props) {
  const { scheme, theme } = useTheme();
  
  const [internalVisible, setInternalVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const menuWidth = 188;

  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;

  const resolvedPosition = anchorMetrics
    ? resolveMenuPosition({ ...anchorMetrics, menuWidth })
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

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 120,
        useNativeDriver: true,
      })
    ]).start(() => {
      setInternalVisible(false);
      setIsClosing(false);
      onClose(); // notify parent
    });
  };

  const handleOptionPress = (optionOnPress: () => void) => {
    if (isClosing) return;
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
      onRequestClose={handleClose}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
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
                disabled={isClosing}
                style={({ pressed }) => [
                  styles.option,
                  isFirst && { borderTopLeftRadius: tokens.radius.lg - 1, borderTopRightRadius: tokens.radius.lg - 1 },
                  isLast && { borderBottomLeftRadius: tokens.radius.lg - 1, borderBottomRightRadius: tokens.radius.lg - 1 },
                  pressed && {
                    backgroundColor: theme.colors.primarySoft,
                  },
                  pressed && styles.optionPressed,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                ]}
                onPress={() => handleOptionPress(option.onPress)}
              >
                  <AppText variant="body">{option.title}</AppText>
                </Pressable>
              );
            })}
          </Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    minWidth: 176,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  optionPressed: {
    opacity: 0.7,
  },
});

export default AppFloatingMenu;
