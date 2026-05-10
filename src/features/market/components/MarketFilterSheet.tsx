import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { DEFAULT_MARKET_FILTERS } from '@/src/features/market/marketUtils';
import type { MarketAvailabilityKey, MarketFilters, MarketSortKey } from '@/src/features/market/types';

type Props = {
  visible: boolean;
  filters: MarketFilters;
  categoryOptions: string[];
  brandOptions: string[];
  resultCount: number;
  onClose: () => void;
  onApply: (filters: MarketFilters) => void;
  onClear: () => void;
};

const SORT_OPTIONS: Array<{ key: MarketSortKey; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'popular', label: 'Popular' },
  { key: 'price_asc', label: 'Price low' },
  { key: 'price_desc', label: 'Price high' },
];

const AVAILABILITY_OPTIONS: Array<{ key: MarketAvailabilityKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'Ready to wear' },
  { key: 'custom_ready', label: 'Custom ready' },
];

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <AppText variant="captionBold" tone={selected ? 'inverse' : 'secondary'} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function MarketFilterSheet({
  visible,
  filters,
  categoryOptions,
  brandOptions,
  resultCount,
  onClose,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<MarketFilters>(filters);

  useEffect(() => {
    if (visible) {
      setDraft(filters);
    }
  }, [filters, visible]);

  const clearDraft = () => {
    setDraft(DEFAULT_MARKET_FILTERS);
    onClear();
  };

  return (
    <AppBottomSheet
      visible={visible}
      title="Filters"
      onClose={onClose}
      showCloseButton
      footer={
        <View style={styles.footer}>
          <Button title="Clear all" variant="secondary" size="md" onPress={clearDraft} style={styles.footerButton} />
          <Button
            title={`Show ${resultCount} results`}
            size="md"
            onPress={() => onApply(draft)}
            style={styles.footerButton}
          />
        </View>
      }
    >
      <View style={styles.section}>
        <AppText variant="subtitle">Category</AppText>
        <View style={styles.wrap}>
          <OptionChip label="All" selected={!draft.category} onPress={() => setDraft((current) => ({ ...current, category: null }))} />
          {categoryOptions.map((category) => (
            <OptionChip
              key={category}
              label={category}
              selected={draft.category === category}
              onPress={() => setDraft((current) => ({ ...current, category }))}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="subtitle">Brand or Store</AppText>
        <View style={styles.wrap}>
          <OptionChip label="All brands" selected={!draft.brand} onPress={() => setDraft((current) => ({ ...current, brand: null }))} />
          {brandOptions.slice(0, 12).map((brand) => (
            <OptionChip
              key={brand}
              label={brand}
              selected={draft.brand === brand}
              onPress={() => setDraft((current) => ({ ...current, brand }))}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="subtitle">Price Range</AppText>
        <View style={styles.priceRow}>
          <Input
            label="Minimum price"
            hideLabel
            keyboardType="numeric"
            value={draft.minPrice}
            onChangeText={(minPrice) => setDraft((current) => ({ ...current, minPrice }))}
            placeholder="Min"
            containerStyle={styles.priceInput}
          />
          <Input
            label="Maximum price"
            hideLabel
            keyboardType="numeric"
            value={draft.maxPrice}
            onChangeText={(maxPrice) => setDraft((current) => ({ ...current, maxPrice }))}
            placeholder="Max"
            containerStyle={styles.priceInput}
          />
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="subtitle">Availability</AppText>
        <View style={styles.wrap}>
          {AVAILABILITY_OPTIONS.map((option) => (
            <OptionChip
              key={option.key}
              label={option.label}
              selected={draft.availability === option.key}
              onPress={() => setDraft((current) => ({ ...current, availability: option.key }))}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="subtitle">Sort</AppText>
        <View style={styles.wrap}>
          {SORT_OPTIONS.map((option) => (
            <OptionChip
              key={option.key}
              label={option.label}
              selected={draft.sort === option.key}
              onPress={() => setDraft((current) => ({ ...current, sort: option.key }))}
            />
          ))}
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: tokens.spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  chip: {
    minHeight: 38,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  pressed: {
    opacity: 0.76,
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
