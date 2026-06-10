import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type ThreadlySheetOption = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export type ThreadlySheetProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: ThreadlySheetOption[];
  onClose: () => void;
};

export function ThreadlySheet({
  visible,
  title,
  subtitle,
  options,
  onClose,
}: ThreadlySheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot} accessibilityViewIsModal>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.backdropStrong }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        />

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, tokens.spacing.lg),
              backgroundColor: theme.colors.bottomSheetSurface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {title || subtitle ? (
            <View style={styles.header}>
              {title ? (
                <AppText variant="subtitle" numberOfLines={2}>
                  {title}
                </AppText>
              ) : null}
              {subtitle ? (
                <AppText variant="captionRegular" tone="muted" numberOfLines={3}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.options}
          >
            {options.map((option, index) => (
              <Pressable
                key={`${option.label}-${index}`}
                disabled={option.disabled}
                onPress={() => {
                  if (option.disabled) return;
                  onClose();
                  requestAnimationFrame(option.onSelect);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: pressed
                      ? theme.colors.primarySoft
                      : theme.colors.surfaceAlt,
                    borderColor: pressed ? theme.colors.primary : theme.colors.border,
                    opacity: option.disabled ? 0.52 : pressed ? 0.82 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                {option.icon ? (
                  <View style={[styles.optionIcon, { backgroundColor: theme.colors.surface }]}>
                    {option.icon}
                  </View>
                ) : null}
                <AppText
                  variant="bodyBold"
                  tone={option.destructive ? 'danger' : 'default'}
                  numberOfLines={1}
                  style={styles.optionLabel}
                >
                  {option.label}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
    ...tokens.elevation.lg,
  },
  header: {
    gap: tokens.spacing.xs,
    paddingRight: tokens.spacing.lg,
  },
  options: {
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
  },
  optionRow: {
    minHeight: 56,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
  },
});

export default ThreadlySheet;
