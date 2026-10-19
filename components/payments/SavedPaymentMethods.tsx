import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { paymentApi } from '@/src/api/PaymentApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { tokens } from '@/src/styles/tokens';
import { drillDownPush } from '@/src/utils/mobileNavigation';

export function SavedPaymentMethods({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const cards = useQuery({
    queryKey: ['paymentMethods', user?.id],
    queryFn: paymentApi.savedCards,
    enabled: isAuthenticated,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setEditing(null);
    } catch (error: any) {
      toast.error(
        typeof error?.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Unable to update this card. Refresh and try again.',
      );
    } finally {
      void client.invalidateQueries({ queryKey: ['paymentMethods'] });
      void client.invalidateQueries({ queryKey: ['brand-queue-subscription'] });
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <AppText variant="body">
        Cards saved at checkout and subscription payment are available together.
        Only masked card details appear here.
      </AppText>
      {cards.isPending ? (
        <AppText>Loading cards…</AppText>
      ) : cards.isError ? (
        <>
          <AppText>Unable to load saved cards.</AppText>
          <Button
            title="Retry cards"
            variant="secondary"
            onPress={() => void cards.refetch()}
          />
        </>
      ) : !cards.data?.length ? (
        <AppText tone="muted">No saved cards yet.</AppText>
      ) : (
        cards.data.map((card) => (
          <View
            key={card.id}
            style={{
              gap: tokens.spacing.sm,
              paddingVertical: tokens.spacing.sm,
            }}
          >
            {onSelect ? (
              <Pressable
                disabled={busy || !card.reusable}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selected === card.id,
                  disabled: !card.reusable,
                }}
                onPress={() => onSelect(card.id)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <AppText variant="bodyBold">
                  {selected === card.id ? '●' : '○'}{' '}
                  {card.nickname || card.brand || 'Card'} •••• {card.last4}
                </AppText>
              </Pressable>
            ) : (
              <AppText variant="bodyBold">
                {card.nickname || card.brand || 'Card'} •••• {card.last4}
              </AppText>
            )}
            <AppText variant="caption" tone="muted">
              Expires {card.expMonth}/{card.expYear}
              {card.isDefault ? ' · Checkout default' : ''}
              {!card.reusable ? ' · Use a new card at secure checkout' : ''}
            </AppText>
            {!onSelect ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: tokens.spacing.md,
                }}
              >
                <Button
                  title="Edit nickname"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => {
                    setEditing(card.id);
                    setNickname(card.nickname || '');
                  }}
                />
                {!card.isDefault && card.reusable ? (
                  <Button
                    title="Make default"
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                      void mutate(() => paymentApi.defaultCard(card.id))
                    }
                  />
                ) : null}
                <Button
                  title="Delete"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      'Delete saved card?',
                      'Cards used for automatic renewal need a replacement or renewal cancellation first.',
                      [
                        { text: 'Keep card', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () =>
                            void mutate(() => paymentApi.deleteCard(card.id)),
                        },
                      ],
                    )
                  }
                />
              </View>
            ) : null}
            {editing === card.id ? (
              <>
                <Input
                  label="Card nickname"
                  value={nickname}
                  maxLength={60}
                  onChangeText={setNickname}
                />
                <Button
                  title="Save nickname"
                  disabled={busy}
                  onPress={() =>
                    void mutate(() => paymentApi.renameCard(card.id, nickname))
                  }
                />
              </>
            ) : null}
          </View>
        ))
      )}
      {onSelect ? (
        <>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !selected }}
            onPress={() => onSelect('')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <AppText variant="bodyBold">
              {!selected ? '●' : '○'} Use a new card at secure checkout
            </AppText>
          </Pressable>
          <Button
            title="Manage saved cards"
            variant="secondary"
            onPress={() => drillDownPush('/settings/payment' as never)}
          />
        </>
      ) : (
        <>
          <AppText tone="muted">
            Add or replace a card during an actual checkout or subscription
            payment. There is no standalone verification charge.
          </AppText>
          <Button
            title="Add a card during checkout"
            variant="secondary"
            onPress={() => drillDownPush('/checkout' as never)}
          />
        </>
      )}
    </View>
  );
}
