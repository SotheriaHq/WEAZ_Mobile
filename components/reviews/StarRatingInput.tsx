import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export default function StarRatingInput({ value, onChange, disabled = false }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
      {[1, 2, 3, 4, 5].map((rating) => (
        <Pressable
          key={rating}
          onPress={() => onChange(rating)}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === rating, disabled }}
          accessibilityLabel={`${rating} star${rating === 1 ? '' : 's'}`}
          style={({ pressed }) => [styles.starButton, pressed && !disabled ? styles.pressed : null]}
        >
          <AppText variant="subtitle" tone={value >= rating ? 'warning' : 'muted'}>
            ★
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  starButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
