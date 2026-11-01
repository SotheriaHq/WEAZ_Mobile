import { CustomOrderQueueApi } from '@/src/api/CustomOrderQueueApi';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppBadge } from '@/components/ui/AppBadge';
import {
  SubscriptionApi,
  type SubscriptionPreview,
  type SubscriptionPayment,
} from '@/src/api/SubscriptionApi';
import { brandApi } from '@/src/api/BrandApi';
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
        <View style={styles.content}>
          <AppText>
            {switching
              ? switchError
                ? 'Unable to switch billing workspace. Reopen billing to retry.'
                : 'Opening your billing workspace…'
              : 'Only the brand owner can open this billing workspace.'}
          </AppText>
        </View>
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

  const brandProfile = useQuery({
    queryKey: ['brand-profile-sub', brandId],
    queryFn: () => brandApi.getProfileById(brandId!),
    enabled: owner,
  });

  const isBrandVerified =
    brandProfile.data?.verificationStatus === 'APPROVED' ||
    brandProfile.data?.verified === true ||
    Boolean((user as any)?.isVerifiedBrand);

  const billing = useQuery({
    queryKey: key,
    queryFn: () => SubscriptionApi.get(brandId!),
    enabled: owner,
  });

  useEffect(() => {
    void client.invalidateQueries({ queryKey: ['brand-commerce-access'] });
  }, [
    client,
    billing.data?.subscription?.tierKey,
    billing.data?.subscription?.status,
    billing.data?.subscription?.currentPeriodEnd,
  ]);

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
  const [pending, setPending] = useState<SubscriptionPayment | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
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

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <Header
        title="Billing & Subscriptions"
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
            {/* Pill Navigation Tabs */}
            <View style={styles.tabsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsScroll}
              >
                {(
                  [
                    'plans',
                    'payments',
                    'history',
                    'cards',
                    'preferences',
                  ] as const
                ).map((value) => {
                  const isSelected = tab === value;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isSelected }}
                      key={value}
                      onPress={() => {
                        setTab(value);
                        setCursors([undefined]);
                      }}
                      style={[
                        styles.tabPill,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primarySoft
                            : theme.colors.surfaceCard,
                        },
                      ]}
                    >
                      <AppText
                        variant={isSelected ? 'bodyBold' : 'body'}
                        tone={isSelected ? 'primary' : 'default'}
                      >
                        {
                          {
                            plans: 'Plans & Capacity',
                            payments: 'Billing History',
                            history: 'Subscription History',
                            cards: 'Payment Methods',
                            preferences: 'Queue Preferences',
                          }[value]
                        }
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Error or Loading Banners */}
            {billing.isPending ? (
              <Card variant="elevated">
                <AppText>Loading subscription details…</AppText>
              </Card>
            ) : billing.isError ? (
              <Card variant="elevated">
                <AppText>Unable to load billing.</AppText>
                <Button title="Retry" onPress={() => void billing.refetch()} />
              </Card>
            ) : null}

            {/* Seller Verification Required Banner if unverified */}
            {!isBrandVerified && tab === 'plans' ? (
              <Card variant="tinted" padding="lg">
                <AppText variant="h3">🛡️ Brand Verification Required</AppText>
                <AppText variant="caption" style={{ marginTop: 4 }}>
                  Subscription upgrades and custom order queue capacity are reserved for verified WIEZ brands. Complete seller verification to unlock all paid tiers.
                </AppText>
                <View style={{ marginTop: tokens.spacing.md }}>
                  <Button
                    title="Start Verification"
                    variant="brand"
                    onPress={() => drillDownPush('/studio/store/verification' as never)}
                  />
                </View>
              </Card>
            ) : null}

            {/* Preferences Tab */}
            {tab === 'preferences' ? (
              <Card variant="elevated" padding="lg">
                <AppText variant="h2">Order Preferences</AppText>
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
                  <View style={styles.preferenceBody}>
                    <View style={styles.preferenceRow}>
                      <AppText variant="bodyBold">Intake Status:</AppText>
                      <AppBadge
                        tone={queue.data.intakeAllowed ? 'success' : 'muted'}
                        label={queue.data.intakeAllowed ? 'Accepting Orders' : 'Intake Paused'}
                      />
                    </View>
                    <AppText>
                      Active: {queue.data.counts.ACTIVE} /{' '}
                      {queue.data.capacity.active ?? 'Unlimited'} · In delivery:{' '}
                      {queue.data.counts.IN_DELIVERY} /{' '}
                      {queue.data.capacity.inDelivery ?? 'Unlimited'}
                    </AppText>
                    <View style={styles.preferenceRow}>
                      <AppText variant="bodyBold">Paid Queue Jumps:</AppText>
                      <AppBadge
                        tone={queue.data.queueJumpEnabled ? 'success' : 'muted'}
                        label={queue.data.queueJumpEnabled ? 'Enabled' : 'Disabled'}
                      />
                    </View>
                    <AppText variant="caption">
                      Paid queue jumps allow shoppers to pay a 20% expedited priority fee. Available on Aru and Igwe tiers.
                    </AppText>
                    <Button
                      title={
                        queue.data.queueJumpEnabled
                          ? 'Disable Paid Jumps'
                          : 'Enable Paid Jumps'
                      }
                      variant="secondary"
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
                      <AppText variant="caption">
                        Upgrade to Aru or Igwe under Plans to enable client paid jumps.
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            ) : null}

            {/* Plans Tab */}
            {tab === 'plans' && billing.data ? (
              <>
                {/* Current Subscription Overview Card (ITEM 24) */}
                {subscription ? (
                  <Card variant="liquidGlass" padding="lg">
                    <View style={styles.headerRow}>
                      <View>
                        <AppText variant="captionBold" tone="primary">
                          CURRENT SUBSCRIPTION
                        </AppText>
                        <AppText variant="h2" style={{ marginTop: 2 }}>
                          {tierName(subscription.tierKey)} Plan
                        </AppText>
                      </View>
                      <AppBadge
                        tone={
                          subscription.status === 'ACTIVE'
                            ? 'success'
                            : subscription.status === 'PAST_DUE'
                              ? 'warning'
                              : 'muted'
                        }
                        label={subscription.status}
                      />
                    </View>

                    <View style={{ marginTop: tokens.spacing.sm }}>
                      <AppText variant="h3">
                        {money(subscription.lockedMonthlyPriceNgn)}{' '}
                        <AppText variant="caption">/ month</AppText>
                      </AppText>
                      <AppText variant="caption">
                        Cycle: {date(subscription.currentPeriodStart)} — {date(subscription.currentPeriodEnd)}
                      </AppText>
                      <AppText variant="caption" style={{ marginTop: 4 }}>
                        {subscription.cancelAtPeriodEnd
                          ? 'Automatic renewal stopped. Access continues until the current paid period ends.'
                          : 'Renews monthly on your Lagos billing anniversary.'}
                      </AppText>
                      {subscription.pendingTierKey ? (
                        <AppText variant="caption" tone="primary" style={{ marginTop: 2 }}>
                          Next renewal: {tierName(subscription.pendingTierKey)}
                        </AppText>
                      ) : null}
                      {subscription.recoveryUntil ? (
                        <View style={styles.recoveryNotice}>
                          <AppText variant="caption">
                            Payment recovery deadline: {date(subscription.recoveryUntil)}. Retries occur on days 1, 3, and 7 preserving your locked price.
                          </AppText>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.cardActionsRow}>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Payment Methods"
                        onPress={() => setTab('cards')}
                      />
                      {!subscription.cancelAtPeriodEnd ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Stop Renewal"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              if (
                                await confirmed(
                                  'Stop renewal?',
                                  'Your current paid period is not refunded. Access lasts until its end; existing captured orders continue.',
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
                    </View>
                  </Card>
                ) : (
                  <Card variant="elevated" padding="lg">
                    <AppText variant="h3">No Active Subscription</AppText>
                    <AppText variant="caption" style={{ marginTop: 4 }}>
                      Select a tier below to open custom-order intake and expand your production bandwidth.
                    </AppText>
                  </Card>
                )}

                {/* Available Tier Cards (ITEM 25) */}
                <AppText variant="h3" style={{ marginTop: tokens.spacing.md }}>
                  Available Studio Tiers
                </AppText>

                <View style={styles.tierCardsStack}>
                  {billing.data.tiers.map((plan) => {
                    const isCurrent = subscription?.tierKey === plan.tierKey;
                    const isSelected = tier === plan.tierKey;
                    const isAru = plan.tierKey === 'ARU';
                    const isIgwe = plan.tierKey === 'IGWE';

                    return (
                      <Card
                        key={plan.tierKey}
                        variant={isSelected ? 'liquidGlass' : 'elevated'}
                        padding="md"
                        style={[
                          styles.tierCardWrapper,
                          isSelected && {
                            borderWidth: 2,
                            borderColor: theme.colors.primary,
                            ...tokens.elevation.md,
                          },
                          isCurrent && !isSelected && {
                            borderWidth: 2,
                            borderColor: theme.colors.success ?? theme.colors.primary,
                          },
                        ]}
                      >
                        {/* Luminous Ambient Gradient for highlighted tiers */}
                        {(isSelected || isAru || isIgwe) && (
                          <LinearGradient
                            colors={
                              isIgwe
                                ? ([theme.colors.surfaceAlt, theme.colors.primarySoft, theme.colors.surface] as const)
                                : ([theme.colors.surface, theme.colors.primarySoft, theme.colors.surface] as const)
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.tierGradientBackdrop}
                            pointerEvents="none"
                          />
                        )}

                        {/* Side-by-Side Zero-Waste Layout: Amount Hero on Left, Features by the Side on Right */}
                        <View style={styles.tierSideBySideRow}>
                          {/* Left Column: Plan Name, Hero Amount Focus, and Action CTA */}
                          <View style={styles.tierLeftColumn}>
                            <View style={styles.tierTitleBadgeRow}>
                              <AppText variant="h3">{plan.label}</AppText>
                              {isCurrent ? (
                                <AppBadge tone="success" label="ACTIVE" />
                              ) : isSelected ? (
                                <AppBadge tone="primary" label="SELECTED" />
                              ) : isAru ? (
                                <AppBadge tone="primary" label="⭐ POPULAR" />
                              ) : isIgwe ? (
                                <AppBadge tone="muted" label="👑 COUTURE" />
                              ) : null}
                            </View>

                            {/* Hero Amount Callout — Primary Attention on Amounts */}
                            <View style={styles.heroAmountBlock}>
                              <AppText variant="title" tone="primary" style={styles.heroAmountFigure}>
                                {money(plan.monthlyPriceNgn)}
                              </AppText>
                              <AppText variant="caption" tone="muted">
                                / month (VAT incl.)
                              </AppText>
                            </View>

                            <View style={styles.tierLeftActionContainer}>
                              {isCurrent ? (
                                <Button
                                  title="Current Plan"
                                  variant="secondary"
                                  size="sm"
                                  disabled
                                />
                              ) : !isBrandVerified ? (
                                <Button
                                  title="Verify Brand"
                                  variant="secondary"
                                  size="sm"
                                  onPress={() => drillDownPush('/studio/store/verification' as never)}
                                />
                              ) : (
                                <Button
                                  title={isSelected ? `Selected ✓` : `Select ${plan.label}`}
                                  variant={isSelected || isAru || isIgwe ? 'brand' : 'secondary'}
                                  size="sm"
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
                              )}
                            </View>
                          </View>

                          {/* Subtle Vertical Divider */}
                          <View style={[styles.tierVerticalDivider, { backgroundColor: theme.colors.border }]} />

                          {/* Right Column: Features By The Side (Compact, High Density, Zero Waste) */}
                          <View style={styles.tierRightColumn}>
                            <View style={styles.tierFeatureRowCompact}>
                              <AppText variant="captionBold" tone="primary" style={styles.checkGlyph}>✓</AppText>
                              <AppText variant="caption" style={styles.tierFeatureTextCompact}>
                                {plan.maxActive ? `${plan.maxActive} Active Custom Orders` : 'Unlimited Active Orders'}
                              </AppText>
                            </View>

                            <View style={styles.tierFeatureRowCompact}>
                              <AppText variant="captionBold" tone="primary" style={styles.checkGlyph}>✓</AppText>
                              <AppText variant="caption" style={styles.tierFeatureTextCompact}>
                                {plan.maxInDelivery ? `${plan.maxInDelivery} Delivery Pipeline` : 'Unlimited Delivery Pipeline'}
                              </AppText>
                            </View>

                            <View style={styles.tierFeatureRowCompact}>
                              <AppText variant="captionBold" tone="primary" style={styles.checkGlyph}>✓</AppText>
                              <AppText variant="caption" style={styles.tierFeatureTextCompact}>
                                1 Up Next Staging Slot
                              </AppText>
                            </View>

                            <View style={styles.tierFeatureRowCompact}>
                              <AppText variant="captionBold" tone="primary" style={styles.checkGlyph}>✓</AppText>
                              <AppText variant="caption" style={styles.tierFeatureTextCompact}>
                                Unlimited Intake Inquiries
                              </AppText>
                            </View>

                            <View style={styles.tierFeatureRowCompact}>
                              <AppText variant="captionBold" tone={plan.queueJumpAllowed ? 'primary' : 'muted'} style={styles.checkGlyph}>
                                {plan.queueJumpAllowed ? '⚡' : '✕'}
                              </AppText>
                              <AppText
                                variant="caption"
                                tone={plan.queueJumpAllowed ? 'default' : 'muted'}
                                style={styles.tierFeatureTextCompact}
                              >
                                {plan.queueJumpAllowed ? 'Paid Client Queue Jumps' : 'Queue Jumps (Aru+ only)'}
                              </AppText>
                            </View>
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                </View>

                {/* Feature Comparison Accordion (ITEM 26) */}
                <Card variant="elevated" padding="md">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setComparisonOpen((prev) => !prev)}
                    style={styles.accordionHeader}
                  >
                    <AppText variant="bodyBold">
                      {comparisonOpen ? '▼ Hide Feature Comparison' : '▶ Compare All 4 Tiers & Limits'}
                    </AppText>
                  </Pressable>

                  {comparisonOpen && (
                    <View style={styles.comparisonTable}>
                      <View style={styles.comparisonRow}>
                        <AppText variant="captionBold" style={{ width: '32%' }}>Feature</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>Thread</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>Aso-oke</AppText>
                        <AppText variant="captionBold" style={{ width: '17%' }}>Aru</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>Igwe</AppText>
                      </View>
                      <View style={styles.comparisonRow}>
                        <AppText variant="caption" style={{ width: '32%' }}>Rate</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>₦10k</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>₦15k</AppText>
                        <AppText variant="captionBold" style={{ width: '17%' }}>₦30k</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>₦50k</AppText>
                      </View>
                      <View style={styles.comparisonRow}>
                        <AppText variant="caption" style={{ width: '32%' }}>Active</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>2</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>3</AppText>
                        <AppText variant="captionBold" style={{ width: '17%' }}>4</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>6</AppText>
                      </View>
                      <View style={styles.comparisonRow}>
                        <AppText variant="caption" style={{ width: '32%' }}>Delivery</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>2</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>4</AppText>
                        <AppText variant="captionBold" style={{ width: '17%' }}>5</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>5</AppText>
                      </View>
                      <View style={styles.comparisonRow}>
                        <AppText variant="caption" style={{ width: '32%' }}>Paid Jumps</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>—</AppText>
                        <AppText variant="caption" style={{ width: '17%' }}>—</AppText>
                        <AppText variant="captionBold" tone="primary" style={{ width: '17%' }}>✓ Yes</AppText>
                        <AppText variant="caption" tone="primary" style={{ width: '17%' }}>✓ Yes</AppText>
                      </View>
                    </View>
                  )}
                </Card>

                {/* Plan Review & Checkout Drawer/Card (ITEM 28) */}
                {preview ? (
                  <Card variant="liquidGlass" padding="lg">
                    <AppText variant="h3">Review {tierName(tier)}</AppText>
                    <View style={{ marginTop: tokens.spacing.sm, gap: 4 }}>
                      <AppText variant="bodyBold">
                        {preview.kind === 'DOWNGRADE'
                          ? 'Due at Renewal'
                          : 'Due Now (Prorated)'}
                        : {money(preview.amountNgn)}
                      </AppText>
                      <AppText variant="caption">
                        Effective: {date(preview.effectiveAt)} · Period ends: {date(preview.periodEnd)}
                      </AppText>
                      <AppText variant="caption">
                        Upgrades are prorated to the exact second and activate after payment. Downgrades take effect on your next Lagos billing anniversary without refunding the current period.
                      </AppText>
                    </View>

                    <View style={{ marginTop: tokens.spacing.md }}>
                      <Button
                        title={
                          cardId
                            ? 'Change Selected Card'
                            : 'Choose Saved Card or Use New Card'
                        }
                        variant="secondary"
                        onPress={() => setTab('cards')}
                      />
                    </View>

                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: consent }}
                      onPress={() => setConsent((value) => !value)}
                      style={styles.checkbox}
                    >
                      <AppText variant="caption">
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
                            <AppText tone="primary" variant="caption">
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

                    <View style={{ marginTop: tokens.spacing.md, gap: tokens.spacing.sm }}>
                      <Button
                        title={
                          busy ? 'Processing…' : 'Confirm Subscription Change'
                        }
                        variant="brand"
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
                      <Button
                        title="Cancel"
                        variant="ghost"
                        disabled={busy}
                        onPress={() => {
                          setPreview(null);
                          setTier('');
                        }}
                      />
                    </View>
                  </Card>
                ) : null}
              </>
            ) : null}

            {/* History and Payments Tabs */}
            {tab === 'payments' || tab === 'history' ? (
              <View style={styles.historyContainer}>
                <AppText variant="h3">
                  {tab === 'payments' ? 'Billing Invoices' : 'Subscription Records'}
                </AppText>
                {history.isPending ? (
                  <Card variant="elevated">
                    <AppText>Loading history…</AppText>
                  </Card>
                ) : history.isError ? (
                  <Card variant="elevated">
                    <Button
                      title="Retry History"
                      onPress={() => void history.refetch()}
                    />
                  </Card>
                ) : !history.data?.items.length ? (
                  <Card variant="elevated">
                    <AppText>
                      No {tab === 'payments' ? 'payments' : 'subscriptions'} yet.
                    </AppText>
                  </Card>
                ) : (
                  history.data.items.map((item) => (
                    <Card key={item.id} variant="elevated" padding="md">
                      <View style={styles.headerRow}>
                        <AppText variant="bodyBold">
                          {tierName(item.tierKey)}
                        </AppText>
                        <AppBadge
                          tone={item.status === 'PAID' ? 'success' : 'muted'}
                          label={item.status || 'RECORD'}
                        />
                      </View>
                      <AppText variant="body" tone="primary" style={{ marginTop: 2 }}>
                        {money(
                          item.amountNgn ?? item.lockedMonthlyPriceNgn ?? 0,
                        )}
                      </AppText>
                      <AppText variant="caption">
                        {date(item.periodStart ?? item.currentPeriodStart)} —{' '}
                        {date(item.periodEnd ?? item.currentPeriodEnd)}
                      </AppText>
                      {item.reference ? (
                        <AppText variant="caption" style={{ marginTop: 2 }}>
                          Reference: {item.reference}
                        </AppText>
                      ) : null}
                      {item.cancelAtPeriodEnd ? (
                        <AppText variant="caption">
                          Renewal cancelled {date(item.cancelRequestedAt)}. Current period not refunded.
                        </AppText>
                      ) : null}
                    </Card>
                  ))
                )}
                <View style={styles.paginationRow}>
                  <Button
                    title="Previous"
                    variant="secondary"
                    size="sm"
                    disabled={cursors.length === 1 || history.isFetching}
                    onPress={() => setCursors((values) => values.slice(0, -1))}
                  />
                  <Button
                    title="Next"
                    variant="secondary"
                    size="sm"
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

            {/* Cards Tab */}
            {tab === 'cards' ? (
              <View style={styles.cardsContainer}>
                <AppText variant="h3">Saved Payment Methods</AppText>
                <AppText variant="caption">
                  Cards saved from checkout can also be used for automatic monthly renewal.
                </AppText>

                <Button
                  title={
                    !cardId
                      ? '✓ New Card at Secure Checkout'
                      : 'Use New Card at Secure Checkout'
                  }
                  variant="secondary"
                  onPress={() => {
                    setCardId('');
                    setConsent(false);
                    setCardConsent(false);
                  }}
                />

                {cards.isPending ? (
                  <Card variant="elevated">
                    <AppText>Loading cards…</AppText>
                  </Card>
                ) : cards.isError ? (
                  <Card variant="elevated">
                    <Button
                      title="Retry Cards"
                      onPress={() => void cards.refetch()}
                    />
                  </Card>
                ) : !cards.data?.length ? (
                  <Card variant="elevated">
                    <AppText>No saved payment cards yet.</AppText>
                  </Card>
                ) : (
                  cards.data.map((card) => {
                    const isSelected = cardId === card.id;
                    const isRenewal = subscription?.savedPaymentMethodId === card.id;
                    return (
                      <Card
                        key={card.id}
                        variant={isSelected ? 'liquidGlass' : 'elevated'}
                        padding="md"
                      >
                        <View style={styles.headerRow}>
                          <AppText variant="bodyBold">
                            {card.nickname || card.brand || 'Card'} ···· {card.last4}
                          </AppText>
                          {isRenewal && (
                            <AppBadge tone="primary" label="RENEWAL CARD" />
                          )}
                        </View>
                        <AppText variant="caption">
                          Expires {card.expMonth}/{card.expYear}
                          {card.isDefault ? ' · Checkout default' : ''}
                        </AppText>
                        <View style={{ marginTop: tokens.spacing.sm }}>
                          <Button
                            title={
                              isSelected
                                ? '✓ Selected for Payment'
                                : card.reusable
                                  ? 'Select for Payment'
                                  : 'Reauthorize at Checkout'
                            }
                            variant={isSelected ? 'brand' : 'secondary'}
                            size="sm"
                            disabled={!card.reusable || busy}
                            onPress={() => {
                              setCardId(card.id);
                              setConsent(false);
                            }}
                          />
                        </View>
                      </Card>
                    );
                  })
                )}

                {cardId && (
                  <Card variant="tinted" padding="md">
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: cardConsent }}
                      onPress={() => setCardConsent((v) => !v)}
                      style={styles.checkbox}
                    >
                      <AppText variant="caption">
                        {cardConsent ? '☑' : '☐'} Authorize this saved card for future monthly renewals ({LEGAL_PAGE_VERSION}).
                      </AppText>
                    </Pressable>
                    <Button
                      title="Set As Renewal Card"
                      variant="brand"
                      size="sm"
                      disabled={!cardConsent || busy}
                      onPress={() =>
                        void run(async () => {
                          await SubscriptionApi.changeCard(brandId!, cardId);
                          toast.success('Renewal card updated.');
                        })
                      }
                    />
                  </Card>
                )}

                {preview ? (
                  <Button
                    title="Return to Plan Review"
                    variant="ghost"
                    onPress={() => setTab('plans')}
                  />
                ) : null}
              </View>
            ) : null}

            {/* Pending Verification Card */}
            {pending?.reference ? (
              <Card variant="liquidGlass" padding="md">
                <AppText variant="bodyBold">{message || 'Payment status pending verification.'}</AppText>
                <AppText variant="caption" style={{ marginTop: 2 }}>
                  Ref: {pending.reference}
                </AppText>
                <View style={{ marginTop: tokens.spacing.sm, gap: tokens.spacing.sm }}>
                  <Button
                    title="Verify Payment Status"
                    variant="brand"
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
                      title="Resume Payment"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void run(() => openPayment(pending))}
                    />
                  ) : null}
                </View>
              </Card>
            ) : null}
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
  tabsContainer: {
    marginHorizontal: -tokens.spacing.lg,
  },
  tabsScroll: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  tabPill: {
    minHeight: 40,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recoveryNotice: {
    marginTop: tokens.spacing.xs,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.themes.light.colors.surfaceAlt,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  tierCardsStack: {
    gap: tokens.spacing.md,
  },
  tierCardWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  tierGradientBackdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.45,
  },
  tierSideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierLeftColumn: {
    flex: 1.15,
    paddingRight: tokens.spacing.sm,
    justifyContent: 'space-between',
  },
  tierTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    flexWrap: 'wrap',
  },
  heroAmountBlock: {
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.xs,
  },
  heroAmountFigure: {
    letterSpacing: -0.5,
  },
  tierLeftActionContainer: {
    marginTop: tokens.spacing.xs,
  },
  tierVerticalDivider: {
    width: 2,
    alignSelf: 'stretch',
    opacity: 0.35,
    marginHorizontal: tokens.spacing.xs,
  },
  tierRightColumn: {
    flex: 1.25,
    paddingLeft: tokens.spacing.xs,
    gap: 4,
    justifyContent: 'center',
  },
  tierFeatureRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  checkGlyph: {
    width: 14,
    textAlign: 'center',
  },
  tierFeatureTextCompact: {
    flex: 1,
    flexShrink: 1,
  },
  accordionHeader: {
    paddingVertical: tokens.spacing.xs,
  },
  comparisonTable: {
    marginTop: tokens.spacing.sm,
    paddingTop: tokens.spacing.sm,
    borderTopWidth: 2,
    borderTopColor: tokens.themes.light.colors.border,
    gap: tokens.spacing.xs,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  preferenceBody: {
    marginTop: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  historyContainer: {
    gap: tokens.spacing.md,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  cardsContainer: {
    gap: tokens.spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.xs,
  },
  checkbox: {
    minHeight: 44,
    paddingVertical: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
});
