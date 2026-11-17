import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';

interface PrimaryAuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  ghost?: boolean;
}

/**
 * The auth screens' main call to action. The solid form is the shared primary
 * Button, which is brand-tinted Strong Lens glass (and inert glass when
 * disabled), so login and signup match every other primary CTA in the app.
 */
export function PrimaryAuthButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  ghost = false,
}: PrimaryAuthButtonProps) {
  return (
    <Button
      title={title}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      variant={ghost ? 'outline' : 'brand'}
      size="lg"
      fullWidth
      style={styles.button}
      textStyle={styles.label}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: tokens.radius.lg,
    // iOS keeps the soft lift; Android draws no elevation behind translucent glass.
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: tokens.colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
        }
      : null),
  },
  label: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
