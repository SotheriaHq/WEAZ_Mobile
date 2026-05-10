import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type EmptyProps = {
  onClear: () => void;
  onRetry: () => void;
};

export function MarketEmptyState({ onClear, onRetry }: EmptyProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <AppText variant="display">⌕</AppText>
      <AppText variant="subtitle" style={styles.center}>No market items found</AppText>
      <AppText variant="body" tone="muted" style={styles.center}>
        Clear filters or retry to load the latest products and designs.
      </AppText>
      <View style={styles.actions}>
        <Button title="Clear filters" onPress={onClear} size="md" style={styles.button} />
        <Button title="Retry" onPress={onRetry} size="md" variant="secondary" style={styles.button} />
      </View>
    </View>
  );
}

type ErrorProps = {
  message: string;
  onRetry: () => void;
};

export function MarketErrorState({ message, onRetry }: ErrorProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <AppText variant="display">!</AppText>
      <AppText variant="subtitle" style={styles.center}>Unable to load market</AppText>
      <AppText variant="body" tone="muted" style={styles.center}>
        {message}
      </AppText>
      <Button title="Retry" onPress={onRetry} size="md" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: tokens.spacing.lg,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  button: {
    flex: 1,
  },
});
