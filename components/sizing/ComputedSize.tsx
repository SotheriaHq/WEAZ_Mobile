/**
 * "Your size", in the two shapes the app needs it.
 *
 * Explicit variants rather than one component with a `compact` boolean: the two
 * do genuinely different things. `ComputedSizeChip` is a value read at a glance
 * beside the avatar and only exists when there IS a value. `ComputedSizePanel`
 * is the answer the fittings screen is about, and it has to be just as
 * articulate when the answer is "not yet" — including saying WHOSE job the
 * missing piece is.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

import type { ComputedSizeState } from '@/src/features/sizing/computedSize';

export const SIZE_EMOJI = '📐';

/**
 * Compact size readout for the profile header.
 *
 * Renders nothing when there is no computed size — the header is not the place
 * to explain a setup gap, and an empty-state slab beside the avatar is exactly
 * the dead space this was meant to fill. `ComputedSizePanel` carries the
 * explanation, on the screen that can act on it.
 */
export function ComputedSizeChip({
  state,
  onPress,
}: {
  state: ComputedSizeState;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  /*
    The one non-ready state the header does speak to.

    The rule below — no empty-state slab beside the avatar — holds for the
    states whose cause is somewhere else: an unpublished chart is WIEZ's setup
    step, and a list of missing points is a job for the fittings screen. This one
    is different. Its cause is visible on this screen, in the measurement chips
    right beside it, and those chips are already marked; leaving the header
    silent would put a ⚠ on a shopper's own number with nothing to explain it.
  */
  if (state.kind === 'bad-measurements') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${state.problems.length} measurement${state.problems.length === 1 ? '' : 's'} need checking. Open my fittings.`}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.warning },
          pressed ? styles.pressed : null,
        ]}
      >
        <AppText variant="captionBold" tone="muted" numberOfLines={1}>
          {SIZE_EMOJI} Your size
        </AppText>
        <AppText variant="captionBold" tone="warning" numberOfLines={2}>
          Check {state.problems.length} measurement
          {state.problems.length === 1 ? '' : 's'}
        </AppText>
      </Pressable>
    );
  }

  if (state.kind !== 'ready') return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your size is ${state.size}. Open my fittings.`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.focusRing },
        pressed ? styles.pressed : null,
      ]}
    >
      <AppText variant="captionBold" tone="muted" numberOfLines={1}>
        {SIZE_EMOJI} Your size
      </AppText>
      <AppText variant="h2" tone="primary" numberOfLines={1}>
        {state.size}
      </AppText>
      {state.regionLabel ? (
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {state.regionLabel}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/**
 * The full readout, with an honest empty state.
 *
 * `charts-unavailable` deliberately does NOT offer an action: there is nothing
 * the shopper can do about an unpublished size chart, and a button that implies
 * otherwise sends them back through measurements they already gave us.
 */
export function ComputedSizePanel({ state }: { state: ComputedSizeState }) {
  const { theme } = useTheme();

  const frame = [
    styles.panel,
    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  ];

  if (state.kind === 'ready') {
    return (
      <View style={frame}>
        <AppText variant="captionBold" tone="muted">
          {SIZE_EMOJI} Your size
        </AppText>
        <AppText variant="display">{state.size}</AppText>
        {state.regionLabel || state.confidenceLabel ? (
          <AppText variant="captionRegular" tone="muted">
            {[state.regionLabel, state.confidenceLabel].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {state.categories.length > 0 ? (
          <View style={styles.categoryWrap}>
            {state.categories.map((entry) => (
              <View
                key={entry.category}
                style={[
                  styles.categoryPill,
                  { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                ]}
              >
                <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                  {entry.label}
                </AppText>
                <AppText variant="captionBold" numberOfLines={1}>
                  {entry.size}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {state.stale ? (
          <AppText variant="captionRegular" tone="warning">
            These measurements are getting old — worth checking before your next order.
          </AppText>
        ) : null}
      </View>
    );
  }

  if (state.kind === 'charts-unavailable') {
    return (
      <View style={frame}>
        <AppText variant="captionBold" tone="muted">
          {SIZE_EMOJI} Your size
        </AppText>
        <AppText variant="subtitle" tone="muted">
          Not available yet
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          {state.message}
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Your measurements are saved and brands can still use them for custom orders.
        </AppText>
      </View>
    );
  }

  /*
    A measurement was given and it is wrong.

    This branch exists because the other one is actively misleading here: the
    engine counts a withheld measurement as missing, so a shopper whose chest
    reads 45 cm would be told to "Add Chest / bust below" — pointing them at a
    field that already holds a number. The server's own sentence names the value
    and the likely mistake ("45 cm is about half a real chest/bust … did you mean
    90 cm?"), which is the only wording that leads anywhere.
  */
  if (state.kind === 'bad-measurements') {
    return (
      <View style={frame}>
        <AppText variant="captionBold" tone="muted">
          {SIZE_EMOJI} Your size
        </AppText>
        <AppText variant="subtitle" tone="warning">
          Check your measurements
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          {state.problems[0].message}
        </AppText>
        {state.problems.length > 1 ? (
          <AppText variant="captionRegular" tone="muted">
            {state.problems.length - 1} other measurement
            {state.problems.length - 1 === 1 ? '' : 's'} need checking too.
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={frame}>
      <AppText variant="captionBold" tone="muted">
        {SIZE_EMOJI} Your size
      </AppText>
      <AppText variant="subtitle" tone="muted">
        Not worked out yet
      </AppText>
      <AppText variant="captionRegular" tone="muted">
        {state.missingLabels.length > 0
          ? `Add ${formatList(state.missingLabels)} below and it appears here.`
          : 'Fill in the points below and it appears here.'}
      </AppText>
    </View>
  );
}

/** "Chest / bust, Waist and Inseam" — a sentence, not a dot-separated dump. */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'flex-start',
    gap: tokens.spacing.xs,
    minWidth: 96,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  panel: {
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    minHeight: 32,
    maxWidth: '100%',
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
});
