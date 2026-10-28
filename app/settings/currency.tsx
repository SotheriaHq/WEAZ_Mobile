import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader } from '@/components/settings/SettingsPrimitives';
import { AppText } from '@/components/ui/AppText';
import {
  AUTO_CURRENCY,
  BASE_CURRENCY,
  setDisplayCurrencyPreference,
  useDisplayCurrency,
} from '@/src/currency/displayCurrency';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { currencySymbol } from '@/src/utils/money';

type Option = { code: string; label: string };

/**
 * Which currency prices are shown in. Display only: the shopper always pays in
 * Naira, and brands are always paid in Naira. Twin of the web Currency tab.
 */
export default function CurrencySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, preference } = useDisplayCurrency();

  const options = useMemo<Option[]>(
    () => [
      { code: AUTO_CURRENCY, label: 'Automatic (based on your country)' },
      ...Object.keys(data?.rates ?? {})
        .sort()
        .map((code) => ({ code, label: `${code} · ${currencySymbol(code).trim()}` })),
    ],
    [data],
  );

  const status = !data
    ? 'Prices show in Naira while currency estimates load.'
    : data.needsCurrencyChoice
      ? 'Your country uses more than one currency. Choose the one you want to see.'
      : data.displayCurrency === BASE_CURRENCY
        ? 'Prices show in Naira.'
        : `Prices show in Naira with an estimate in ${data.displayCurrency}.`;

  const renderItem = useCallback(
    ({ item }: { item: Option }) => {
      const selected = item.code === preference;
      return (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          onPress={() => void setDisplayCurrencyPreference(item.code)}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: theme.colors.border },
            pressed ? styles.pressed : null,
          ]}
        >
          <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'} style={styles.rowLabel}>
            {item.label}
          </AppText>
          <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
            {selected ? <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} /> : null}
          </View>
        </Pressable>
      );
    },
    [preference, theme.colors.border, theme.colors.primary],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Currency" />
      <FlatList
        data={options}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
        ListHeaderComponent={
          <View style={styles.intro}>
            <AppText variant="body" tone="muted">
              See prices in your own currency. You always pay in Naira (NGN), and other currencies
              are estimates at today&apos;s rate.
            </AppText>
            <AppText variant="captionRegular" tone="muted" accessibilityLiveRegion="polite">
              {status}
              {data?.isStale ? ' Rates are from earlier; estimates may be less accurate.' : ''}
            </AppText>
            <AppText variant="captionRegular" tone="muted">
              Automatic uses the country your connection comes from. We don&apos;t ask for your
              location and don&apos;t store it. Your choice is saved on this device.
            </AppText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  intro: {
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderBottomWidth: 2,
  },
  rowLabel: {
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pressed: {
    opacity: 0.72,
  },
});
