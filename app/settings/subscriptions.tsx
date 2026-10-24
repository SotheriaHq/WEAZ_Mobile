import { CustomOrderQueueApi } from '@/src/api/CustomOrderQueueApi';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  SubscriptionApi,
  type SubscriptionPreview,
  type SubscriptionPayment,
} from '@/src/api/SubscriptionApi';
import { useAuth } from '@/src/auth/AuthContext';
import { getActiveBrandId, isBrandOwner } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { tokens } from '@/src/styles/tokens';
import { LEGAL_PAGE_VERSION } from '@/src/legal/legalDocuments';
import { env } from '@/src/config/env';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';

const tierName = (key?: string | null) =>
  ({
    THREAD: 'Thread',
    ASO_OKE: 'Aso-oke',
    ARU: 'Aru',
    IGWE: 'Igwe',
  })[key || ''] ||
  key ||
  'No plan';
const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    value,
  );
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) +
      ' WAT'
    : 'Not scheduled';
function confirmed(
  title: string,
  message: string,
  action = 'Confirm',
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Go back', style: 'cancel', onPress: () => resolve(false) },
        {
          text: action,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export default function SubscriptionSettingsScreen() {
  const { user, setActiveBrandId } = useAuth();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    brandId?: string;
    reference?: string;
  }>();
  const requestedBrandId =
    typeof params.brandId === 'string' ? params.brandId : null;
  const activeBrandId = getActiveBrandId(user);
  const switching = Boolean(
    requestedBrandId &&
      requestedBrandId !== activeBrandId &&
      isBrandOwner(user, requestedBrandId),
  );
  const [switchError, setSwitchError] = useState(false);
  useEffect(() => {
    if (!switching || !requestedBrandId) return;
    void setActiveBrandId(requestedBrandId).catch(() => setSwitchError(true));
  }, [switching, requestedBrandId, setActiveBrandId]);
  if (requestedBrandId && requestedBrandId !== activeBrandId)
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Header
          title="Billing & subscriptions"
          left={
            <AppBackButton
              onPress={() => topLevelNavigate('/studio' as never)}
            />
          }
        />
        <AppText>
          {switching
            ? switchError
              ? 'Unable to switch billing workspace. Reopen billing to retry.'
              : 'Opening your billing workspace…'
            : 'Only the brand owner can open this billing workspace.'}
        </AppText>
      </SafeAreaView>
    );
  return (
    <SubscriptionSettingsContent
      key={`${user?.id || ''}:${getActiveBrandId(user) || ''}`}
      reference={
        typeof params.reference === 'string' ? params.reference : undefined
      }
    />
  );
}

function SubscriptionSettingsContent({ reference }: { reference?: string }) {
  const { user, status } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const brandId = getActiveBrandId(user);
  const owner = Boolean(brandId && isBrandOwner(user, brandId));
  const key = ['brand-queue-subscription', user?.id, brandId];
  const billing = useQuery({
    queryKey: key,
    queryFn: () => SubscriptionApi.get(brandId!),
    enabled: owner,
  });
  useEffect(() => { void client.invalidateQueries({ queryKey: ['brand-commerce-access'] }); }, [client, billing.data?.subscription?.tierKey, billing.data?.subscription?.status, billing.data?.subscription?.currentPeriodEnd]);
  const cards = useQuery({
    queryKey: [...key, 'cards'],
    queryFn: () => SubscriptionApi.cards(brandId!),
    enabled: owner,
  });
  const [tab, setTab] = useState<
    'plans' | 'payments' | 'history' | 'cards' | 'preferences'
  >('plans');
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const history = useQuery({
    queryKey: [...key, 'history', tab, cursors[cursors.length - 1]],
    queryFn: () =>
      SubscriptionApi.history(
        brandId!,
        tab === 'payments' ? 'BILLING' : 'SUBSCRIPTIONS',
        cursors[cursors.length - 1],
      ),
    enabled: owner && (tab === 'payments' || tab === 'history'),
  });
  const queue = useQuery({
    queryKey: [...key, 'preferences'],
    queryFn: () => CustomOrderQueueApi.brand(brandId!),
    enabled: owner && tab === 'preferences',
  });
  const [tier, setTier] = useState('');
  const [preview, setPreview] = useState<SubscriptionPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [cardId, setCardId] = useState('');
  const [cardConsent, setCardConsent] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [pending, setPending] = useState<SubscriptionPayment | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const verification = useRef<{
    reference: string;
    promise: ReturnType<typeof SubscriptionApi.verify>;
  } | null>(null);
  useEffect(() => {
    if (!owner || !brandId || !reference) return;
    if (verification.current?.reference !== reference)
      verification.current = {
        reference,
        promise: SubscriptionApi.verify(brandId, reference),
      };
    setPending({ reference, amountNgn: 0, action: 'VERIFYING' });
    let active = true;
    void verification.current.promise
      .then((result) => {
        if (active) {
          setMessage(`Payment status: ${result.status}.`);
          void client.invalidateQueries({
            queryKey: ['brand-queue-subscription', user?.id, brandId],
          });
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            'Payment is not yet verified. Check its status before starting another payment.',
          );
      });
    return () => {
      active = false;
    };
  }, [owner, brandId, reference, client, user?.id]);
  async function run(action: () => Promise<void>) {
    if (busy || !owner) return;
    setBusy(true);
    try {
      await action();
    } catch (error: any) {
      const detail = error?.response?.data?.message;
      toast.error(
        typeof detail === 'string'
          ? detail
          : 'Unable to complete this billing action. Refresh its status before paying again.',
      );
    } finally {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ['paymentMethods'] });
      setBusy(false);
    }
  }
  async function openPayment(payment: SubscriptionPayment) {
    if (!mounted.current) return;
    if (!payment.authorizationUrl) return;
    const url = new URL(payment.authorizationUrl);
    if (url.protocol !== 'https:')
      throw new Error('Invalid secure payment address');
    await WebBrowser.openBrowserAsync(url.toString());
    if (payment.reference) {
      const result = await SubscriptionApi.verify(brandId!, payment.reference);
      setMessage(`Payment status: ${result.status}.`);
    }
  }
  const subscription = billing.data?.subscription;
  const rowStyle = [styles.section, { borderBottomColor: theme.colors.border }];
  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <Header
        title="Billing & subscriptions"
        left={
          <AppBackButton
            emoji="👈"
            onPress={() => topLevelNavigate('/studio' as never)}
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {status === 'loading' ? (
          <AppText>Loading your account…</AppText>
        ) : !owner ? (
          <AppText>
            Only the brand owner can access billing, subscriptions and saved
            payment methods.
          </AppText>
        ) : (
          <>
            <View style={styles.tabs}>
              {(
                [
                  'plans',
                  'payments',
                  'history',
                  'cards',
                  'preferences',
                ] as const
              ).map((value) => (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === value }}
                  key={value}
                  onPress={() => {
                    setTab(value);
                    setCursors([undefined]);
                  }}
                  style={[
                    styles.tab,
                    tab === value
                      ? { borderBottomColor: theme.colors.primary }
                      : null,
                  ]}
                >
                  <AppText variant="bodyBold">
                    {
                      {
                        plans: 'Plans',
                        payments: 'Billing history',
                        history: 'Subscription history',
                        cards: 'Payment methods',
                        preferences: 'Order preferences',
                      }[value]
                    }
                  </AppText>
                </Pressable>
              ))}
            </View>
            {billing.isPending ? (
              <AppText>Loading billing…</AppText>
            ) : billing.isError ? (
              <>
                <AppText>Unable to load billing.</AppText>
                <Button title="Retry" onPress={() => void billing.refetch()} />
              </>
            ) : null}
            {tab === 'preferences' ? (
              <View style={rowStyle}>
                <AppText variant="h2">Order preferences</AppText>
                {queue.isPending ? (
                  <AppText>Loading queue preferences…</AppText>
                ) : queue.isError ? (
                  <>
                    <AppText>Unable to load queue preferences.</AppText>
                    <Button
                      title="Retry preferences"
                      onPress={() => void queue.refetch()}
                    />
                  </>
                ) : queue.data ? (
                  <>
                    <AppText>
                      {queue.data.intakeAllowed
                        ? 'Accepting custom orders'
                        : 'New custom-order intake paused'}
                    </AppText>
                    <AppText>
                      Active: {queue.data.counts.ACTIVE} /{' '}
                      {queue.data.capacity.active ?? 'Unlimited'} · In delivery:{' '}
                      {queue.data.counts.IN_DELIVERY} /{' '}
                      {queue.data.capacity.inDelivery ?? 'Unlimited'}
                    </AppText>
                    <AppText>
                      Paid queue jumps:{' '}
                      {queue.data.queueJumpEnabled ? 'Enabled' : 'Disabled'}.
                      Available on Aru and Igwe. Existing paid jumps keep their
                      priority when disabled.
                    </AppText>
                    <Button
                      title={
                        queue.data.queueJumpEnabled
                          ? 'Disable paid jumps'
                          : 'Enable paid jumps'
                      }
                      disabled={busy || !queue.data.capacity.queueJumpAllowed}
                      onPress={() =>
                        void run(async () => {
                          const enabled = !queue.data.queueJumpEnabled;
                          if (
                            !(await confirmed(
                              enabled
                                ? 'Enable paid jumps?'
                                : 'Disable paid jumps?',
                              'Existing paid jumps retain priority. New paid priority costs 20% of garment subtotal and preserves the current Up Next order.',
                            ))
                          )
                            return;
                          await CustomOrderQueueApi.settings(brandId!, enabled);
                          void client.invalidateQueries({
                            queryKey: ['store'],
                          });
                        })
                      }
                    />
                    {!queue.data.capacity.queueJumpAllowed ? (
                      <AppText>
                        Review Aru or Igwe under Plans to enable paid jumps.
                      </AppText>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
            {tab === 'plans' && billing.data ? (
              <>
                <View style={rowStyle}>
                  <AppText variant="h2">
                    {tierName(subscription?.tierKey)}
                  </AppText>
                  <AppText>
                    {subscription?.status ||
                      'Choose a plan to open custom-order intake'}
                  </AppText>
                  {subscription ? (
                    <>
                      <AppText>
                        {money(subscription.lockedMonthlyPriceNgn)} / month
                      </AppText>
                      <AppText>
                        {date(subscription.currentPeriodStart)} —{' '}
                        {date(subscription.currentPeriodEnd)}
                      </AppText>
                      <AppText>
                        {subscription.cancelAtPeriodEnd
                          ? 'Renewal stopped. Access continues until the paid period ends.'
                          : 'Renews monthly on your Lagos billing anniversary.'}
                      </AppText>
                      {subscription.pendingTierKey ? (
                        <AppText>
                          Next renewal: {tierName(subscription.pendingTierKey)}
                        </AppText>
                      ) : null}
                      {subscription.recoveryUntil ? (
                        <AppText>
                          Payment recovery deadline:{' '}
                          {date(subscription.recoveryUntil)}. New intake pauses
                          at paid expiry.
                        </AppText>
                      ) : null}
                      {!subscription.cancelAtPeriodEnd ? (
                        <Button
                          variant="secondary"
                          title="Cancel automatic renewal"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              if (
                                await confirmed(
                                  'Stop renewal?',
                                  'Your current paid period is not refunded. Access lasts until its end; existing paid orders continue.',
                                  'Stop renewal',
                                  true,
                                )
                              ) {
                                await SubscriptionApi.cancel(brandId!);
                                toast.success('Automatic renewal cancelled.');
                              }
                            })
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                </View>
                <View style={styles.grid}>
                  {billing.data.tiers.map((plan) => (
                    <View
                      style={[
                        styles.plan,
                        { borderTopColor: theme.colors.border },
                      ]}
                      key={plan.tierKey}
                    >
                      <AppText variant="h3">{plan.label}</AppText>
                      <AppText variant="bodyBold">
                        {money(plan.monthlyPriceNgn)} / month
                      </AppText>
                      <AppText>
                        {plan.maxActive ?? 'Unlimited'} Active ·{' '}
                        {plan.maxInDelivery ?? 'Unlimited'} In Delivery
                      </AppText>
                      <AppText>1 Up Next · Unlimited Pending</AppText>
                      <Button
                        title={
                          subscription?.tierKey === plan.tierKey
                            ? 'Review current plan'
                            : 'Review plan'
                        }
                        variant="secondary"
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            setTier(plan.tierKey);
                            setPreview(null);
                            setConsent(false);
                            setPreview(
                              await SubscriptionApi.preview(
                                brandId!,
                                plan.tierKey,
                              ),
                            );
                          })
                        }
                      />
                    </View>
                  ))}
                </View>
                {preview ? (
                  <View style={rowStyle}>
                    <AppText variant="h3">Review {tierName(tier)}</AppText>
                    <AppText>
                      {preview.kind === 'DOWNGRADE'
                        ? 'Due at renewal'
                        : 'Due now'}
                      : {money(preview.amountNgn)}
                    </AppText>
                    <AppText>
                      Effective {date(preview.effectiveAt)} · period ends{' '}
                      {date(preview.periodEnd)}
                    </AppText>
                    <AppText>
                      Upgrades are prorated and start after verified payment.
                      Downgrades start at renewal. Subscription cancellation
                      does not refund the current period.
                    </AppText>
                    <Button
                      title={
                        cardId
                          ? 'Change selected saved card'
                          : 'Choose saved card or use a new card'
                      }
                      variant="secondary"
                      onPress={() => setTab('cards')}
                    />
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: consent }}
                      onPress={() => setConsent((value) => !value)}
                      style={styles.checkbox}
                    >
                      <AppText>
                        {consent ? '☑' : '☐'} I authorize recurring monthly
                        charges and accept the Terms, Seller Terms and Payment
                        Policy ({LEGAL_PAGE_VERSION}).
                      </AppText>
                    </Pressable>
                    <View style={styles.actions}>
                      {['terms', 'seller-terms', 'payment-policy'].map(
                        (slug) => (
                          <Pressable
                            key={slug}
                            accessibilityRole="link"
                            onPress={() =>
                              drillDownPush(`/legal/${slug}` as never)
                            }
                          >
                            <AppText tone="primary">
                              {slug === 'terms'
                                ? 'Terms'
                                : slug === 'seller-terms'
                                  ? 'Seller Terms'
                                  : 'Payment Policy'}
                            </AppText>
                          </Pressable>
                        ),
                      )}
                    </View>
                    <Button
                      title={
                        busy ? 'Processing…' : 'Confirm subscription change'
                      }
                      disabled={!consent || busy}
                      onPress={() =>
                        void run(async () => {
                          if (
                            !(await confirmed(
                              'Confirm plan change?',
                              `${money(preview.amountNgn)} ${preview.kind === 'DOWNGRADE' ? 'due at renewal' : 'due now'}. Effective ${date(preview.effectiveAt)}. No refund for cancellation.`,
                              'Confirm',
                            ))
                          )
                            return;
                          const result = await SubscriptionApi.checkout(
                            brandId!,
                            tier,
                            preview.amountNgn,
                            new URL(
                              `/settings?tab=subscription-billing&brandId=${encodeURIComponent(brandId!)}`,
                              env.webAppUrl,
                            ).toString(),
                            cardId || undefined,
                          );
                          if (!mounted.current) return;
                          setPending(result);
                          setMessage(
                            result.action === 'SCHEDULED_DOWNGRADE'
                              ? 'Downgrade scheduled for renewal.'
                              : result.action === 'UNCHANGED'
                                ? 'This plan is already current.'
                                : 'Verify payment status before starting another payment.',
                          );
                          await openPayment(result);
                        })
                      }
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            {tab === 'payments' || tab === 'history' ? (
              <View style={rowStyle}>
                {history.isPending ? (
                  <AppText>Loading history…</AppText>
                ) : history.isError ? (
                  <Button
                    title="Retry history"
                    onPress={() => void history.refetch()}
                  />
                ) : !history.data?.items.length ? (
                  <AppText>
                    No {tab === 'payments' ? 'payments' : 'subscriptions'} yet.
                  </AppText>
                ) : (
                  history.data.items.map((item) => (
                    <View key={item.id} style={rowStyle}>
                      <AppText variant="bodyBold">
                        {tierName(item.tierKey)} · {item.status}
                      </AppText>
                      <AppText>
                        {money(
                          item.amountNgn ?? item.lockedMonthlyPriceNgn ?? 0,
                        )}
                      </AppText>
                      <AppText>
                        {date(item.periodStart ?? item.currentPeriodStart)} —{' '}
                        {date(item.periodEnd ?? item.currentPeriodEnd)}
                      </AppText>
                      {item.reference ? (
                        <AppText>Receipt reference: {item.reference}</AppText>
                      ) : null}
                      {item.cancelAtPeriodEnd ? (
                        <AppText>
                          Renewal cancelled {date(item.cancelRequestedAt)}.
                          Current period not refunded.
                        </AppText>
                      ) : null}
                    </View>
                  ))
                )}
                <View style={styles.actions}>
                  <Button
                    title="Previous"
                    variant="secondary"
                    disabled={cursors.length === 1 || history.isFetching}
                    onPress={() => setCursors((values) => values.slice(0, -1))}
                  />
                  <Button
                    title="Next"
                    variant="secondary"
                    disabled={!history.data?.nextCursor || history.isFetching}
                    onPress={() =>
                      setCursors((values) => [
                        ...values,
                        history.data!.nextCursor!,
                      ])
                    }
                  />
                </View>
              </View>
            ) : null}
            {tab === 'cards' ? (
              <View style={rowStyle}>
                <AppText variant="h3">Your payment methods</AppText>
                <AppText>
                  Cards saved from checkout can also pay for subscriptions.
                  Default checkout and subscription renewal selections are
                  separate.
                </AppText>
                <Button
                  title={
                    !cardId
                      ? '✓ New card at secure checkout'
                      : 'Use a new card at secure checkout'
                  }
                  variant="secondary"
                  onPress={() => {
                    setCardId('');
                    setConsent(false);
                    setCardConsent(false);
                  }}
                />
                {cards.isPending ? (
                  <AppText>Loading cards…</AppText>
                ) : cards.isError ? (
                  <Button
                    title="Retry cards"
                    onPress={() => void cards.refetch()}
                  />
                ) : !cards.data?.length ? (
                  <AppText>No saved cards yet.</AppText>
                ) : (
                  cards.data.map((card) => (
                    <View key={card.id} style={rowStyle}>
                      <AppText variant="bodyBold">
                        {card.nickname || card.brand || 'Card'} ····{' '}
                        {card.last4}
                      </AppText>
                      <AppText>
                        Expires {card.expMonth}/{card.expYear}
                        {card.isDefault ? ' · Checkout default' : ''}
                        {subscription?.savedPaymentMethodId === card.id
                          ? ' · Subscription renewal'
                          : ''}
                      </AppText>
                      <Button
                        title={
                          cardId === card.id
                            ? '✓ Selected for payment'
                            : card.reusable
                              ? 'Select for payment'
                              : 'Reauthorize at checkout'
                        }
                        variant="secondary"
                        disabled={!card.reusable || busy}
                        onPress={() => {
                          setCardId(card.id);
                          setConsent(false);
                          setCardConsent(false);
                        }}
                      />
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
                              void run(async () => {
                                await SubscriptionApi.renameCard(
                                  card.id,
                                  nickname,
                                );
                                setEditing(null);
                                toast.success('Card nickname updated.');
                              })
                            }
                          />
                          <Button
                            title="Cancel edit"
                            variant="secondary"
                            onPress={() => setEditing(null)}
                          />
                        </>
                      ) : (
                        <Button
                          title="Edit nickname"
                          variant="secondary"
                          disabled={busy}
                          onPress={() => {
                            setEditing(card.id);
                            setNickname(card.nickname || '');
                          }}
                        />
                      )}
                      {!card.isDefault ? (
                        <Button
                          title="Make checkout default"
                          variant="secondary"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await SubscriptionApi.defaultCard(card.id);
                              toast.success('Checkout default updated.');
                            })
                          }
                        />
                      ) : null}
                      <Button
                        title="Delete card"
                        variant="secondary"
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            if (
                              await confirmed(
                                'Delete this card?',
                                'Replace its renewal selection or stop automatic renewal first. Past payment receipts remain available.',
                                'Delete',
                                true,
                              )
                            ) {
                              await SubscriptionApi.deleteCard(card.id);
                              if (cardId === card.id) setCardId('');
                              setConsent(false);
                              toast.success('Saved card deleted.');
                            }
                          })
                        }
                      />
                    </View>
                  ))
                )}
                {subscription &&
                cardId &&
                cardId !== subscription.savedPaymentMethodId ? (
                  <>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: cardConsent }}
                      onPress={() => setCardConsent((value) => !value)}
                      style={styles.checkbox}
                    >
                      <AppText>
                        {cardConsent ? '☑' : '☐'} I authorize this card for
                        recurring subscription payments under the Payment Policy
                        ({LEGAL_PAGE_VERSION}). This does not restart cancelled
                        renewal.
                      </AppText>
                    </Pressable>
                    <Button
                      title="Use selected card for renewal"
                      disabled={!cardConsent || busy}
                      onPress={() =>
                        void run(async () => {
                          await SubscriptionApi.changeCard(brandId!, cardId);
                          toast.success('Renewal card updated.');
                        })
                      }
                    />
                  </>
                ) : null}
                <AppText>
                  New cards are added only with an actual payment. No standalone
                  verification fee is charged.
                </AppText>
                <Button
                  title="Add a new card during checkout"
                  variant="secondary"
                  onPress={() => drillDownPush('/checkout' as never)}
                />
                {preview ? (
                  <Button
                    title="Return to plan review"
                    onPress={() => setTab('plans')}
                  />
                ) : null}
              </View>
            ) : null}
            {pending?.reference ? (
              <View style={rowStyle}>
                <AppText>{message}</AppText>
                <AppText>Payment reference: {pending.reference}</AppText>
                <Button
                  title="Verify payment"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const result = await SubscriptionApi.verify(
                        brandId!,
                        pending.reference!,
                      );
                      setMessage(`Payment status: ${result.status}.`);
                    })
                  }
                />
                {pending.authorizationUrl ? (
                  <Button
                    title="Resume payment"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void run(() => openPayment(pending))}
                  />
                ) : null}
              </View>
            ) : null}
            {billing.data?.invoices
              .filter(
                (invoice) =>
                  !['PAID', 'CANCELLED', 'EXPIRED'].includes(invoice.status),
              )
              .map((invoice) => (
                <View style={rowStyle} key={invoice.id}>
                  <AppText variant="bodyBold">
                    Payment needing attention · {invoice.status}
                  </AppText>
                  <AppText>
                    {money(invoice.amountNgn)} · {invoice.reference}
                  </AppText>
                  <Button
                    title="Check payment status"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const result = await SubscriptionApi.verify(
                          brandId!,
                          invoice.reference,
                        );
                        toast.info(`Payment status: ${result.status}`);
                      })
                    }
                  />
                  {invoice.authorizationUrl ? (
                    <Button
                      title="Complete existing payment"
                      variant="secondary"
                      disabled={busy}
                      onPress={() =>
                        void run(() =>
                          openPayment({ ...invoice, action: 'RESUME' }),
                        )
                      }
                    />
                  ) : null}
                </View>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
    gap: tokens.spacing.lg,
  },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  tab: {
    minHeight: 44,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  section: {
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  plan: {
    width: '47%',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.lg,
    borderTopWidth: 2,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  checkbox: { minHeight: 44, paddingVertical: tokens.spacing.sm },
});
