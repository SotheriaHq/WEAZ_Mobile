import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  SIZE_CHARTS,
  formatMeasurement,
  type LengthUnitPreference,
} from '@/src/data/sizeCharts';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Column widths. The size column is pinned outside the horizontal scroller so a
 * row never loses its label while the user pans across the measurements — the
 * single thing that makes a wide table usable on a phone.
 */
const SIZE_COL_WIDTH = 76;
const DATA_COL_WIDTH = 66;

function TableHeaderCell({ label, width }: { label: string; width: number }) {
  return (
    <View style={[styles.cell, { width }]}>
      <AppText variant="captionBold" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export default function SizeGuideScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [chartId, setChartId] = useState(SIZE_CHARTS[0].id);
  const [unit, setUnit] = useState<LengthUnitPreference>('CM');

  const chart = useMemo(
    () => SIZE_CHARTS.find((entry) => entry.id === chartId) ?? SIZE_CHARTS[0],
    [chartId],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <AppText variant="title">Size charts</AppText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Garment family — the charts differ by body, not by region, so this is
            the first choice a buyer has to make. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SIZE_CHARTS.map((entry) => {
            const selected = entry.id === chart.id;
            return (
              <Pressable
                key={entry.id}
                onPress={() => setChartId(entry.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <AppText variant="smallBold" tone={selected ? 'inverse' : 'secondary'}>
                  {entry.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.unitRow}>
          <AppText variant="captionBold" tone="secondary">
            MEASUREMENTS IN
          </AppText>
          <View style={[styles.unitToggle, { borderColor: theme.colors.border }]}>
            {(['CM', 'IN'] as LengthUnitPreference[]).map((option) => {
              const selected = unit === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setUnit(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[
                    styles.unitOption,
                    selected ? { backgroundColor: theme.colors.primary } : null,
                  ]}
                >
                  <AppText variant="smallBold" tone={selected ? 'inverse' : 'secondary'}>
                    {option}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.table, { borderColor: theme.colors.border }]}>
          <View style={styles.tableRowWrap}>
            <View style={[styles.pinnedColumn, { borderRightColor: theme.colors.border }]}>
              <View style={[styles.headerRow, { backgroundColor: theme.colors.surfaceAlt, borderBottomColor: theme.colors.border }]}>
                <TableHeaderCell label="Size" width={SIZE_COL_WIDTH} />
              </View>
              {chart.rows.map((row, index) => (
                <View
                  key={`${row.alpha}-${row.uk}`}
                  style={[
                    styles.bodyRow,
                    { borderBottomColor: theme.colors.border },
                    index % 2 === 1 ? { backgroundColor: theme.colors.surfaceAlt } : null,
                  ]}
                >
                  <View style={[styles.cell, { width: SIZE_COL_WIDTH }]}>
                    <AppText variant="smallBold" numberOfLines={1}>
                      {row.alpha}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scrollColumns}>
              <View>
                <View style={[styles.headerRow, { backgroundColor: theme.colors.surfaceAlt, borderBottomColor: theme.colors.border }]}>
                  <TableHeaderCell label="UK" width={DATA_COL_WIDTH} />
                  <TableHeaderCell label="US" width={DATA_COL_WIDTH} />
                  <TableHeaderCell label="EU" width={DATA_COL_WIDTH} />
                  {chart.measureLabels.map((label) => (
                    <TableHeaderCell key={label} label={label} width={DATA_COL_WIDTH} />
                  ))}
                </View>
                {chart.rows.map((row, index) => (
                  <View
                    key={`${row.alpha}-${row.uk}-data`}
                    style={[
                      styles.bodyRow,
                      { borderBottomColor: theme.colors.border },
                      index % 2 === 1 ? { backgroundColor: theme.colors.surfaceAlt } : null,
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
                        style={[styles.cell, { width: DATA_COL_WIDTH }]}
                      >
                        <AppText variant="small">{formatMeasurement(value, unit)}</AppText>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <AppText variant="captionRegular" tone="muted">
          Swipe the table sideways for UK, US, EU and body measurements. Values are
          BODY measurements, not garment measurements.
        </AppText>

        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="secondary">HOW TO MEASURE</AppText>
          {chart.howToMeasure.map((line) => (
            <AppText key={line} variant="bodyReadable" tone="secondary">
              {line}
            </AppText>
          ))}
          <AppText variant="bodyReadable" tone="secondary">
            Use a flexible tape, keep it level, and measure over light clothing.
          </AppText>
        </View>

        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="secondary">WHY YOUR SIZE STILL VARIES</AppText>
          <AppText variant="bodyReadable" tone="secondary">
            A relaxed XL and a slim XL are different garments. Fit shifts with brand
            grading, fabric stretch, cut and production tolerance, so treat the
            label as a starting point and your measurements as the truth.
          </AppText>
          <AppText variant="bodyReadable" tone="secondary">
            WIEZ does not use one universal Nigerian chart. Nigeria and West Africa
            are measurement-first, and brands can publish approved charts for their
            own garments — which is what a product page recommends from, not this
            reference table.
          </AppText>
        </View>

        <Button
          title="Update my measurements"
          onPress={() => drillDownPush('/(tabs)/me' as any)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  chips: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  unitToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  unitOption: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    minWidth: 48,
    alignItems: 'center',
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bodyRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
    justifyContent: 'center',
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.74,
  },
});
