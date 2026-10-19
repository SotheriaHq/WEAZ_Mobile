import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import type { CustomPriceSummary } from '@/src/api/StoreApi';
import { tokens } from '@/src/styles/tokens';
import { formatMoney } from '@/src/utils/money';

export function CustomOrderPriceBreakdown({ summary, currency }: { summary: CustomPriceSummary; currency: string }) {
  const rows = [
    ['Garment subtotal', summary.subtotal],
    ['VAT', summary.vatAmount], ['Queue priority', summary.queueJumpFee], ['Delivery', summary.shippingFee],
  ] as const;
  return <View style={{ gap: tokens.spacing.sm }}>
    {rows.filter(([, amount]) => amount != null).map(([label, amount]) => <View key={label} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: tokens.spacing.sm }}>
      <AppText variant="body" tone="secondary">{label}</AppText>
      <AppText variant="body">{formatMoney(amount!, currency)}</AppText>
    </View>)}
    {(summary.fabricCharge ?? 0) > 0 || (summary.rushFee ?? 0) > 0 ? <AppText variant="captionRegular" tone="muted">The garment subtotal includes{(summary.fabricCharge ?? 0) > 0 ? ` fabric (${formatMoney(summary.fabricCharge!, currency)})` : ''}{(summary.fabricCharge ?? 0) > 0 && (summary.rushFee ?? 0) > 0 ? ' and' : ''}{(summary.rushFee ?? 0) > 0 ? ` rush production (${formatMoney(summary.rushFee!, currency)})` : ''}.</AppText> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: tokens.spacing.sm }}><AppText variant="bodyBold">Total</AppText><AppText variant="bodyBold">{formatMoney(summary.grandTotal, currency)}</AppText></View>
  </View>;
}
