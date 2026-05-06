import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

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

  if (ghost) {
    return (
      <Button
        title={title}
        onPress={onPress}
        loading={loading}
        disabled={disabled}
        variant="outline"
        size="lg"
        fullWidth
        style={styles.button}
        textStyle={styles.label}
      />
    );
  }

  return (
    <View
      style={[
        styles.button,
        styles.solidContainer,
        { backgroundColor: disabled ? theme.colors.primarySoft : theme.colors.primary },
      ]}
    >
      <Button
        title={title}
        onPress={onPress}
        loading={loading}
        disabled={disabled}
        variant="ghost"
        size="lg"
        fullWidth
        style={styles.innerButton}
        textStyle={styles.label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  solidContainer: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  innerButton: {
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 0,
  },
  label: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
