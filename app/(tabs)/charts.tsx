import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, type Href } from 'expo-router';

import { MeasurementSilhouette } from '@/components/sizing/MeasurementSilhouette';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProfileApi, type SizeFitProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  SIZE_CHARTS,
  formatMeasurement,
  type LengthUnitPreference,
  type SizeChart,
} from '@/src/data/sizeCharts';
import {
  describeDelta,
  findClosestChartRow,
  type BodyMeasurementsCm,
} from '@/src/features/sizing/chartMatch';
import {
  formatMeasurementLabel,
  getMeasurementHint,
  resolveCoreMeasurementKey,
  type CoreMeasurementKey,
} from '@/src/features/sizing/measurementCatalog';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { drillDownPush } from '@/src/utils/mobileNavigation';

/**
 * Size charts — a reading aid that reads YOU.
 *
 * The old guide was a static table behind Settings → Size Guide: pick a chart,
 * squint across a row, then work out on your own which one you are. Everything
 * it needed to do that for you was already on the phone — the shopper's own
 * fittings, in centimetres, keyed by the same points the chart is graded on.
 *
 * So the screen now answers "where do I land?" first, and every part of the
 * table is something you can press:
 *
 *  - a ROW shows that size against your body, measurement by measurement;
 *  - a COLUMN heading (or a pin on the body) shows where that tape goes, with
 *    the same wording the fittings screen uses;
 *  - "Update my fittings" goes to fittings and back, and the answer refreshes
 *    when you return, because the charts re-read your measurements on focus.
 *
 * It stays honest about what it is. These are reference grades, not the brand
 * charts a product page recommends from, and the result says which of your
 * measurements it used and which it is missing.
 */

/** Column widths. The size column is pinned so a row never loses its label. */
const SIZE_COL_WIDTH = 84;
const DATA_COL_WIDTH = 68;
const ROW_HEIGHT = 44;

/** Canonical measurements arrive in cm, keyed by any alias of a point. */
function toBodyCm(sizeFit: SizeFitProfile | null): BodyMeasurementsCm {
  const body: BodyMeasurementsCm = {};
  for (const [key, value] of Object.entries(sizeFit?.canonicalMeasurements ?? {})) {
    const core = resolveCoreMeasurementKey(key);
    if (core && typeof value === 'number' && Number.isFinite(value) && value > 0 && body[core] == null) {
      body[core] = value;
    }
  }
  return body;
}

/** A chart that suits the person, before they have chosen one. */
function defaultChartIdFor(gender: string | null | undefined): string {
  if (gender === 'MALE') return 'men-tops';
  if (gender === 'FEMALE') return 'women-tops';
  return SIZE_CHARTS[0].id;
}

const joinWords = (words: string[]) =>
  words.length <= 1
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

export default function ChartsScreen() {
  const { theme } = useTheme();
  const { status, user } = useAuth();
  const { standardScreenBottomPadding } = useScreenChrome();
  const { width: windowWidth } = useWindowDimensions();
  const authenticated = status === 'authenticated';

  const [chartId, setChartId] = useState(() => defaultChartIdFor(user?.gender));
  const [unit, setUnit] = useState<LengthUnitPreference>('CM');
  const unitChosenRef = useRef(false);
  const [sizeFit, setSizeFit] = useState<SizeFitProfile | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [activeKey, setActiveKey] = useState<CoreMeasurementKey | null>(null);

  /*
    Re-read on every focus, not just mount. This screen is a tab, so it stays
    mounted while the shopper goes to fittings, changes a number, and comes
    back — and the whole point of the round trip is to see the answer move.
  */
  useFocusEffect(
    useCallback(() => {
      if (!authenticated) {
        setSizeFit(null);
        return undefined;
      }
      let active = true;
      void ProfileApi.getSizeFit()
        .then((next) => {
          if (!active) return;
          setSizeFit(next);
          // Speak the shopper's unit until they pick one here themselves.
          if (!unitChosenRef.current && next?.preferredLengthUnit === 'IN') setUnit('IN');
        })
        .catch(() => {
          // The charts still work without fittings; only "where you land" goes.
        });
      return () => {
        active = false;
      };
    }, [authenticated]),
  );

  const chart: SizeChart = useMemo(
    () => SIZE_CHARTS.find((entry) => entry.id === chartId) ?? SIZE_CHARTS[0],
    [chartId],
  );
  const body = useMemo(() => toBodyCm(sizeFit), [sizeFit]);
  const match = useMemo(() => findClosestChartRow(chart, body), [body, chart]);

  // The row being inspected: the shopper's pick, else where they land.
  const focusRowIndex = selectedRowIndex ?? match?.rowIndex ?? null;
  const focusRow = focusRowIndex != null ? chart.rows[focusRowIndex] : null;
  const pointKey: CoreMeasurementKey = activeKey && chart.measureKeys.includes(activeKey)
    ? activeKey
    : chart.primaryKey;
  const pointIndex = chart.measureKeys.indexOf(pointKey);

  const selectChart = useCallback((id: string) => {
    setChartId(id);
    // A row index means nothing on another chart.
    setSelectedRowIndex(null);
    setActiveKey(null);
  }, []);

  const openFittings = useCallback(() => {
    if (!authenticated) {
      router.push({ pathname: '/(auth)/login', params: { next: '/charts' } } as Href);
      return;
    }
    // `from=charts` lets fittings step BACK here instead of stacking a second
    // copy of this screen on top of itself.
    drillDownPush({ pathname: '/fittings', params: { from: 'charts' } } as Href);
  }, [authenticated]);

  const silhouetteWidth = Math.min(240, Math.round(windowWidth * 0.58));
  const pointLabel = (key: CoreMeasurementKey) =>
    chart.measureLabels[chart.measureKeys.indexOf(key)] ?? formatMeasurementLabel(key);
  const fmt = (cm: number) => `${formatMeasurement(cm, unit)} ${unit.toLowerCase()}`;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: standardScreenBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headline}>
          <AppText variant="screenTitle">Size charts</AppText>
          <AppText variant="body" tone="muted">
            Your measurements, read against common size grades.
          </AppText>
        </View>

        {/* ── Where you land ─────────────────────────────────────────── */}
        <Card padding="lg" style={styles.heroCard}>
          {match && focusRow && match.rowIndex === focusRowIndex ? (
            <>
              <AppText variant="captionBold" tone="muted">
                Your closest size on this chart
              </AppText>
              <View style={styles.heroSizeRow}>
                <AppText variant="display" tone="primary">
                  {chart.rows[match.rowIndex].alpha}
                </AppText>
                <AppText variant="bodyBold" tone="secondary">
                  UK {chart.rows[match.rowIndex].uk} · US {chart.rows[match.rowIndex].us} · EU{' '}
                  {chart.rows[match.rowIndex].eu}
                </AppText>
              </View>
              <AppText variant="caption" tone="muted">
                Based on your {joinWords(match.basedOn.map((key) => pointLabel(key).toLowerCase()))}.
              </AppText>
              {match.missing.length > 0 ? (
                <AppText variant="caption" tone="warning">
                  Add your {joinWords(match.missing.map((key) => pointLabel(key).toLowerCase()))} for a closer match.
                </AppText>
              ) : null}
            </>
          ) : match && focusRow ? (
            <>
              <AppText variant="captionBold" tone="muted">
                Comparing size
              </AppText>
              <View style={styles.heroSizeRow}>
                <AppText variant="display">{focusRow.alpha}</AppText>
                <AppText variant="bodyBold" tone="secondary">
                  UK {focusRow.uk} · US {focusRow.us} · EU {focusRow.eu}
                </AppText>
              </View>
              <Pressable
                onPress={() => setSelectedRowIndex(null)}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <AppText variant="captionBold" tone="primary">
                  Back to your closest size ({chart.rows[match.rowIndex].alpha})
                </AppText>
              </Pressable>
            </>
          ) : (
            <>
              <AppText variant="subtitle">Where do you land?</AppText>
              <AppText variant="body" tone="muted">
                {authenticated
                  ? 'Add your measurements and WIEZ will find your closest size on each chart.'
                  : 'Sign in and add your measurements to see your closest size on each chart.'}
              </AppText>
            </>
          )}
          <Button
            title={
              !authenticated ? 'Sign in' : match ? 'Update my fittings' : 'Add my fittings'
            }
            size="sm"
            variant={match ? 'secondary' : 'primary'}
            onPress={openFittings}
            style={styles.heroButton}
          />
        </Card>

        {/* ── Garment family ─────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SIZE_CHARTS.map((entry) => {
            const selected = entry.id === chart.id;
            return (
              <Pressable
                key={entry.id}
                onPress={() => selectChart(entry.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <AppText variant="smallBold" tone={selected ? 'inverse' : 'secondary'} numberOfLines={1}>
                  {entry.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.unitRow}>
          <AppText variant="caption" tone="muted">
            Tap a size to compare it with you, or a measurement to see where it goes.
          </AppText>
          <View style={[styles.unitToggle, { borderColor: theme.colors.border }]}>
            {(['CM', 'IN'] as LengthUnitPreference[]).map((option) => {
              const selected = unit === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    unitChosenRef.current = true;
                    setUnit(option);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.unitOption, selected ? { backgroundColor: theme.colors.primary } : null]}
                >
                  <AppText variant="smallBold" tone={selected ? 'inverse' : 'secondary'} numberOfLines={1}>
                    {option}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── The table ──────────────────────────────────────────────── */}
        <View style={[styles.table, { borderColor: theme.colors.border }]}>
          <View style={styles.tableRowWrap}>
            <View style={[styles.pinnedColumn, { borderRightColor: theme.colors.border }]}>
              <View style={[styles.headerRow, { borderBottomColor: theme.colors.border }]}>
                <View style={[styles.cell, { width: SIZE_COL_WIDTH }]}>
                  <AppText variant="captionBold" tone="muted">Size</AppText>
                </View>
              </View>
              {chart.rows.map((row, index) => {
                const focused = index === focusRowIndex;
                const isMatch = index === match?.rowIndex;
                return (
                  <Pressable
                    key={`${chart.id}-${index}-size`}
                    onPress={() => setSelectedRowIndex(index)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={`Size ${row.alpha}, UK ${row.uk}${isMatch ? ', your closest size' : ''}`}
                    style={[
                      styles.bodyRow,
                      { borderBottomColor: theme.colors.border },
                      focused ? { backgroundColor: theme.colors.primarySoft } : null,
                    ]}
                  >
                    <View style={[styles.cell, styles.sizeCell, { width: SIZE_COL_WIDTH }]}>
                      <AppText variant="smallBold" tone={focused ? 'primary' : 'default'} numberOfLines={1}>
                        {row.alpha}
                      </AppText>
                      {isMatch ? (
                        <View style={[styles.youBadge, { backgroundColor: theme.colors.primary }]}>
                          <AppText variant="badgeLabel" tone="inverse">
                            You
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scrollColumns}>
              <View>
                <View style={[styles.headerRow, { borderBottomColor: theme.colors.border }]}>
                  {['UK', 'US', 'EU'].map((label) => (
                    <View key={label} style={[styles.cell, { width: DATA_COL_WIDTH }]}>
                      <AppText variant="captionBold" tone="muted">{label}</AppText>
                    </View>
                  ))}
                  {chart.measureLabels.map((label, measureIndex) => {
                    const key = chart.measureKeys[measureIndex];
                    const active = key === pointKey;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setActiveKey(key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${label}. Show where to measure.`}
                        style={({ pressed }) => [
                          styles.cell,
                          { width: DATA_COL_WIDTH },
                          active ? { backgroundColor: theme.colors.primarySoft } : null,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText variant="captionBold" tone={active ? 'primary' : 'secondary'} numberOfLines={1}>
                          {label} ⓘ
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {chart.rows.map((row, index) => {
                  const focused = index === focusRowIndex;
                  return (
                    <Pressable
                      key={`${chart.id}-${index}-data`}
                      onPress={() => setSelectedRowIndex(index)}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        styles.bodyRow,
                        { borderBottomColor: theme.colors.border },
                        focused ? { backgroundColor: theme.colors.primarySoft } : null,
                      ]}
                    >
                      <View style={[styles.cell, { width: DATA_COL_WIDTH }]}>
                        <AppText variant="small" tone="secondary">{row.uk}</AppText>
                      </View>
                      <View style={[styles.cell, { width: DATA_COL_WIDTH }]}>
                        <AppText variant="small" tone="secondary">{row.us}</AppText>
                      </View>
                      <View style={[styles.cell, { width: DATA_COL_WIDTH }]}>
                        <AppText variant="small" tone="secondary">{row.eu}</AppText>
                      </View>
                      {row.measures.map((value, measureIndex) => (
                        <View
                          key={chart.measureLabels[measureIndex]}
                          style={[
                            styles.cell,
                            { width: DATA_COL_WIDTH },
                            chart.measureKeys[measureIndex] === pointKey
                              ? { backgroundColor: theme.colors.primarySoft }
                              : null,
                          ]}
                        >
                          <AppText variant={focused ? 'smallBold' : 'small'}>
                            {formatMeasurement(value, unit)}
                          </AppText>
                        </View>
                      ))}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
        <AppText variant="captionRegular" tone="muted">
          Swipe the table sideways for more columns. These are BODY measurements, not garment measurements.
        </AppText>

        {/* ── This size against you ──────────────────────────────────── */}
        {focusRow ? (
          <Card padding="lg" style={styles.sectionCard}>
            <AppText variant="captionBold" tone="muted">
              Size {focusRow.alpha} · UK {focusRow.uk} against you
            </AppText>
            {chart.measureKeys.map((key, measureIndex) => {
              const chartCm = focusRow.measures[measureIndex];
              const bodyCm = body[key];
              const delta = typeof bodyCm === 'number' ? describeDelta(bodyCm, chartCm) : null;
              const active = key === pointKey;
              return (
                <Pressable
                  key={key}
                  onPress={() => setActiveKey(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.compareRow,
                    { borderBottomColor: theme.colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.compareLabel}>
                    <AppText variant={active ? 'bodyBold' : 'body'} tone={active ? 'primary' : 'default'}>
                      {chart.measureLabels[measureIndex]}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      Chart {fmt(chartCm)}
                      {typeof bodyCm === 'number' ? ` · You ${fmt(bodyCm)}` : ' · Not measured yet'}
                    </AppText>
                  </View>
                  {delta ? (
                    <AppText variant="captionBold" tone={delta.tone === 'match' ? 'success' : 'secondary'}>
                      {delta.label}
                    </AppText>
                  ) : (
                    <AppText variant="captionBold" tone="warning">
                      Add
                    </AppText>
                  )}
                </Pressable>
              );
            })}
          </Card>
        ) : null}

        {/* ── Where the tape goes ────────────────────────────────────── */}
        <Card padding="lg" style={styles.sectionCard}>
          <AppText variant="captionBold" tone="muted">
            How to measure
          </AppText>
          <View style={styles.pointChips}>
            {chart.measureKeys.map((key, measureIndex) => {
              const selected = key === pointKey;
              return (
                <Pressable
                  key={key}
                  onPress={() => setActiveKey(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText variant="smallBold" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
                    {chart.measureLabels[measureIndex]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <MeasurementSilhouette
            pointKeys={chart.measureKeys}
            activeKey={pointKey}
            onSelect={setActiveKey}
            width={silhouetteWidth}
          />

          <View style={[styles.pointDetail, { borderTopColor: theme.colors.border }]}>
            <AppText variant="subtitle">{chart.measureLabels[pointIndex]}</AppText>
            {getMeasurementHint(pointKey) ? (
              <AppText variant="bodyReadable" tone="secondary">
                {getMeasurementHint(pointKey)}
              </AppText>
            ) : null}
            {chart.howToMeasure[pointIndex] ? (
              <AppText variant="caption" tone="muted">
                For this chart: {chart.howToMeasure[pointIndex].replace(/^[^—]*—\s*/, '')}
              </AppText>
            ) : null}
            <AppText variant="captionBold" tone={typeof body[pointKey] === 'number' ? 'primary' : 'warning'}>
              {typeof body[pointKey] === 'number'
                ? `Yours: ${fmt(body[pointKey] as number)}`
                : 'You have not measured this yet'}
            </AppText>
          </View>
          <AppText variant="caption" tone="muted">
            Use a flexible tape, keep it level, and measure over light clothing.
          </AppText>
        </Card>

        {/* ── Honest limits ──────────────────────────────────────────── */}
        <View style={[styles.limits, { borderTopColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted">
            Why your size still varies
          </AppText>
          <AppText variant="bodyReadable" tone="secondary">
            A relaxed XL and a slim XL are different garments. Fit shifts with the brand’s grading,
            the fabric’s stretch and the cut, so read the label as a starting point and your
            measurements as the truth.
          </AppText>
          <AppText variant="bodyReadable" tone="secondary">
            These are reference charts. On a product page, WIEZ recommends from that brand’s own
            approved chart for that garment.
          </AppText>
        </View>

        <Button
          title={authenticated ? 'Update my fittings' : 'Sign in to add fittings'}
          onPress={openFittings}
          fullWidth
        />
      </ScrollView>
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
    gap: tokens.spacing.lg,
  },
  headline: {
    gap: tokens.spacing.xs,
  },
  heroCard: {
    gap: tokens.spacing.sm,
  },
  heroSizeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacing.xs,
  },
  chips: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  chip: {
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  unitToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  unitOption: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  tableRowWrap: {
    flexDirection: 'row',
  },
  pinnedColumn: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  scrollColumns: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bodyRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  sizeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: tokens.spacing.xs,
  },
  youBadge: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
  },
  sectionCard: {
    gap: tokens.spacing.md,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compareLabel: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  pointChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  pointDetail: {
    gap: tokens.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
  },
  limits: {
    gap: tokens.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.lg,
  },
});
