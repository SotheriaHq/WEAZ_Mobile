import React from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/theme/ThemeProvider';

interface PrimaryAuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  ghost?: boolean;
}

export function PrimaryAuthButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  ghost = false,
}: PrimaryAuthButtonProps) {
  const { theme } = useTheme();

  return (
    <Button
      title={title}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      variant={ghost ? 'outline' : 'primary'}
      size="lg"
      fullWidth
      style={[styles.button, { shadowColor: theme.colors.backdropStrong }]}
      textStyle={styles.label}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  label: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
