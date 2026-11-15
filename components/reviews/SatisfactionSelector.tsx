import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import type { ReviewSatisfaction } from '@/src/api/ReviewApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { SATISFACTION_OPTIONS } from './reviewDisplay';

type Props = {
  value: ReviewSatisfaction;
  onChange: (value: ReviewSatisfaction) => void;
  disabled?: boolean;
};

export default function SatisfactionSelector({ value, onChange, disabled = false }: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Satisfaction mood">
      {SATISFACTION_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: 'transparent',
                backgroundColor: 'transparent',
              },
              pressed && !disabled ? styles.pressed : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <LiquidGlassFill glassRole={selected ? 'brandSoft' : 'control'} inset={2} borderRadius={tokens.radius.full} />
            <AppText variant="captionBold" tone={option.tone}>
              {option.emoji} {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  option: {
    overflow: 'hidden',
    borderWidth: 2,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.6,
  },
});
