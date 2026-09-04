import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import {
  formatSizingRegion,
  resolveCategorySizes,
} from '@/src/features/sizing/computedSize';
import type { ComputedSizeFitProfile, SizingRegion } from '@/src/api/ProfileApi';
import {
  resolveDisplayCategory,
  useProfileSizeCategory,
} from '@/src/features/sizing/profileSizePreference';

/**
 * Everything about the shopper's SIZE, as opposed to their measurements.
 *
 * These three things used to be spread across the profile: the computed size
 * per garment, which chart it was computed against, and no way at all to say
 * which one the profile should lead with. The profile is the wrong place for
 * any of it — it showed five size pills, a progress bar and eight measurements
 * on a screen whose job is to show a person their account.
 *
 * So the profile keeps one size and this tab owns the rest.
 */

/**
 * The systems a shopper can be sized against.
 *
 * `NG_WEST_AFRICA` leads because WIEZ is Naira-first and its brands cut to
 * local charts; the rest follow in the order a Nigerian shopper is most likely
 * to have encountered them.
 */
const SIZING_REGIONS: SizingRegion[] = [
  'NG_WEST_AFRICA',
  'UK',
  'US',
  'EU',
  'INTERNATIONAL',
];

export type FittingsSizesTabProps = {
  computed: ComputedSizeFitProfile | null;
  preferredRegion: SizingRegion | null;
  onChangeRegion: (region: SizingRegion) => void;
  regionSaving?: boolean;
};

export function FittingsSizesTab({
  computed,
  preferredRegion,
  onChangeRegion,
  regionSaving = false,
}: FittingsSizesTabProps) {
  const { theme } = useTheme();
  const categorySizes = useMemo(() => resolveCategorySizes(computed), [computed]);
  const { category: preferredCategory, setCategory } = useProfileSizeCategory();
  const displayedCategory = resolveDisplayCategory(preferredCategory, categorySizes);

  return (
    <View style={styles.root}>
      <Card padding="sm" style={{ backgroundColor: theme.colors.surfaceAlt }}>
        <AppText variant="bodyBold">Your sizes</AppText>
        <AppText variant="captionRegular" tone="muted">
          {categorySizes.length > 0
            ? 'Tap one to show it on your profile.'
            : 'Add your measurements and your sizes will be worked out here.'}
        </AppText>

        {categorySizes.length > 0 ? (
          <View style={styles.sizeList}>
            {categorySizes.map((entry) => {
              const selected = entry.category === displayedCategory;
              return (
                <Pressable
                  key={entry.category}
                  onPress={() => setCategory(entry.category)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Show ${entry.label} size ${entry.size} on your profile`}
                  style={({ pressed }) => [
                    styles.sizeRow,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.sizeRowCopy}>
                    <AppText variant="bodyBold" numberOfLines={1}>
                      {entry.label}
                    </AppText>
                    <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                      {selected ? 'Shown on your profile' : 'Tap to show on your profile'}
                    </AppText>
                  </View>
                  <AppText
                    variant="bodyBold"
                    tone={selected ? 'primary' : 'default'}
                    numberOfLines={1}
                  >
                    {entry.size}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Card>

      <Card padding="sm" style={{ backgroundColor: theme.colors.surfaceAlt }}>
        <AppText variant="bodyBold">Sized against</AppText>
        <AppText variant="captionRegular" tone="muted">
          Which country's chart your measurements are compared to. Changing it
          recalculates every size above — your measurements do not change.
        </AppText>

        <View style={styles.regionRow}>
          {SIZING_REGIONS.map((region) => {
            const selected = region === preferredRegion;
            return (
              <Pressable
                key={region}
                onPress={() => onChangeRegion(region)}
                disabled={regionSaving || selected}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: regionSaving }}
                style={({ pressed }) => [
                  styles.regionChip,
                  {
                    backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    opacity: regionSaving && !selected ? 0.5 : 1,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText
                  variant="captionBold"
                  tone={selected ? 'inverse' : 'secondary'}
                  numberOfLines={1}
                >
                  {formatSizingRegion(region) ?? region}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: tokens.spacing.lg,
  },
  sizeList: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    minHeight: 56,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sizeRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  regionChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.85,
  },
});

export default FittingsSizesTab;
