import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

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
  const { theme } = useTheme();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuWidth = 188;

  const updateMenuPosition = useCallback(
    (metrics: { pageX: number; pageY: number; width: number; height: number }) => {
      setMenuPosition(resolveMenuPosition({ ...metrics, menuWidth }));
    },
    [menuWidth],
  );

  useEffect(() => {
    if (!visible) return;

    if (anchorMetrics) {
      updateMenuPosition(anchorMetrics);
      return;
    }

    if (anchorRef.current?.measureInWindow) {
      anchorRef.current.measureInWindow((pageX: number, pageY: number, width: number, height: number) => {
        if (width <= 0 || height <= 0) return;
        updateMenuPosition({
          pageX,
          pageY,
          width,
          height,
        });
      });
    }
  }, [anchorMetrics, anchorRef, updateMenuPosition, visible]);

  useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => backHandler.remove();
  }, [visible, onClose]);

  if (!visible || !menuPosition) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View
          style={[
            styles.menu,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuWidth,
              ...tokens.elevation.sm,
            },
          ]}
        >
          {options.map((option, index) => (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.optionPressed,
                index < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
              ]}
              onPress={() => {
                onClose();
                requestAnimationFrame(option.onPress);
              }}
            >
              <AppText variant="body">
                {option.icon}
              </AppText>
              <AppText variant="body">{option.title}</AppText>
            </Pressable>
          ))}
        </View>
      </Pressable>
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
