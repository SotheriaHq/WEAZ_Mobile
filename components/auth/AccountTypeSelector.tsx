import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

type AccountType = 'REGULAR' | 'BRAND' | null;

interface AccountTypeSelectorProps {
  value: AccountType;
  onChange: (type: 'REGULAR' | 'BRAND') => void;
}

interface TypeCardProps {
  type: 'REGULAR' | 'BRAND';
  selected: boolean;
  onSelect: () => void;
  emoji: string;
  title: string;
}

function TypeCard({ type, selected, onSelect, emoji, title }: TypeCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      damping: 15,
      stiffness: 300,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 8,
      stiffness: 200,
    }).start();
  };

  const cardStyle = {
    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
  };

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={`${title} account type`}
        accessibilityState={{ selected }}
      >
        <View style={[styles.card, cardStyle]}>
          <AppText style={styles.cardEmoji}>{emoji}</AppText>
          <AppText
            variant="caption"
            tone={selected ? 'primary' : 'muted'}
            style={styles.cardTitle}
          >
            {title}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function AccountTypeSelector({ value, onChange }: AccountTypeSelectorProps) {
  return (
    <View style={styles.row}>
      <TypeCard
        type="REGULAR"
        selected={value === 'REGULAR'}
        onSelect={() => onChange('REGULAR')}
        emoji="🛍️"
        title="Shopper"
      />
      <TypeCard
        type="BRAND"
        selected={value === 'BRAND'}
        onSelect={() => onChange('BRAND')}
        emoji="✨"
        title="Brand"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.xl,
  },
  cardWrapper: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  pressable: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardTitle: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
