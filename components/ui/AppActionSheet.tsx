import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export type AppActionSheetOption = {
  key: string;
  title: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: AppActionSheetOption[];
  onClose: () => void;
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string | null;
};

export function AppActionSheet({
  visible,
  title,
  subtitle,
  options,
  onClose,
  loading,
  emptyMessage = 'No actions available.',
  errorMessage,
}: Props) {
  const { theme } = useTheme();

  return (
    <AppBottomSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      {errorMessage ? <AppText variant="body" tone="danger">{errorMessage}</AppText> : null}
      {loading ? <AppText variant="body" tone="muted">Loading actions...</AppText> : null}
      {!loading && options.length === 0 ? <AppText variant="body" tone="muted">{emptyMessage}</AppText> : null}

      <View style={styles.stack}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => {
              if (option.disabled) return;
              onClose();
              option.onPress();
            }}
            disabled={option.disabled}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
                opacity: option.disabled ? 0.55 : pressed ? 0.82 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.surface }]}>
              <AppText variant="subtitle">{option.icon ?? '+'}</AppText>
            </View>
            <View style={styles.optionText}>
              <AppText variant="bodyBold" tone={option.destructive ? 'danger' : 'default'}>
                {option.title}
              </AppText>
              {option.description ? (
                <AppText variant="captionRegular" tone="muted">{option.description}</AppText>
              ) : null}
            </View>
            <AppText variant="bodyBold" tone="muted">›</AppText>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.sm,
  },
  option: {
    minHeight: 72,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
});

export default AppActionSheet;
