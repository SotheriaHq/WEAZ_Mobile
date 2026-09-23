import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type WiezSheetOption = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export type WiezSheetProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: WiezSheetOption[];
  onClose: () => void;
};

export function WiezSheet({
  visible,
  title,
  subtitle,
  options,
  onClose,
}: WiezSheetProps) {
  const { theme } = useTheme();

  /*
    Rendered through the shared AppBottomSheet, so an action menu slides, drags
    and dismisses exactly like every selector in the app. It was a plain
    Modal with a cross-fade: no slide, no swipe-to-close, and a different close
    timing from the sheet opened a second earlier.
  */
  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      scrollable={false}
      keyboardBehavior="none"
    >
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
                  // Act immediately so destination routes don't wait a frame
                  // (or longer) while the sheet dismissal animation settles.
                  option.onSelect();
                  onClose();
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
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={styles.optionLabel}
                >
                  {option.label}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
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

export default WiezSheet;
