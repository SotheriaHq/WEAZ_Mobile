import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/components/ui/Button';
import { GRADIENTS, tokens } from '@/src/styles/tokens';

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
    <View style={styles.button}>
      <LinearGradient
        colors={GRADIENTS.primaryButton.colors}
        start={GRADIENTS.primaryButton.start}
        end={GRADIENTS.primaryButton.end}
        style={styles.gradientContainer}
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
      </LinearGradient>
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
  gradientContainer: {
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
