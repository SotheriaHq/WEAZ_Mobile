import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  estimateInDisplayCurrency,
  foreignDisplayCurrency,
  useDisplayCurrency,
} from '@/src/currency/displayCurrency';
import { tokens } from '@/src/styles/tokens';
import { drillDownPush } from '@/src/utils/mobileNavigation';

/** "≈ £27" under a Naira price, for shoppers who read another currency. */
export function PriceEstimateText({
  amount,
  currency,
}: {
  amount: number | null | undefined;
  currency?: string | null;
}) {
  const current = useDisplayCurrency();
  const estimate = estimateInDisplayCurrency(current, amount, currency);
  if (!estimate) return null;
  return (
    <AppText
      variant="captionRegular"
      tone="muted"
      accessibilityLabel={`About ${estimate}, estimate. You pay in Naira.`}
    >
      ≈ {estimate}
    </AppText>
  );
}

/** States that the charge is in Naira whenever prices are read in another currency. */
export function CurrencyChargeNote() {
  const current = useDisplayCurrency();
  const display = foreignDisplayCurrency(current);
  if (!display) return null;
  return (
    <View style={styles.note}>
      <AppText variant="captionRegular" tone="muted">
        You pay in Naira (NGN). Amounts in {display} are estimates at today&apos;s rate; your bank
        sets the final amount.
      </AppText>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => drillDownPush('/settings/currency' as never)}
      >
        <AppText variant="captionBold" tone="primary">
          Change currency
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: tokens.spacing.xs,
  },
});
