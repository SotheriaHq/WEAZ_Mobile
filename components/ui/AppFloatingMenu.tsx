import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';

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
  options: FloatingMenuOption[];
  onClose: () => void;
};

export function AppFloatingMenu({ visible, anchorRef, options, onClose }: Props) {
  const { theme } = useTheme();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (visible && anchorRef.current) {
      anchorRef.current.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        setMenuPosition({
          top: pageY + height + tokens.spacing.xs,
          left: Math.max(tokens.spacing.md, pageX - 100), // adjust to fit
        });
      });
    } else {
      setMenuPosition(null);
    }
  }, [visible, anchorRef]);

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
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View
          style={[
            styles.menu,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              top: menuPosition.top,
              left: menuPosition.left,
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
                option.onPress();
                onClose();
              }}
            >
              <AppText variant="body" style={styles.icon}>
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
    borderRadius: tokens.radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 150,
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
  icon: {
    fontSize: 18,
  },
});

export default AppFloatingMenu;