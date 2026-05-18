import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ReviewSummaryDto } from '@/src/api/ReviewApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { SATISFACTION_OPTIONS } from './reviewDisplay';

type Props = {
  summary: ReviewSummaryDto;
};

function RatingBar({ rating, count, total }: { rating: number; count: number; total: number }) {
  const { theme } = useTheme();
  const percent = total > 0 ? `${(count / total) * 100}%` : '0%';

  return (
    <View style={styles.ratingRow}>
      <AppText variant="caption" tone="muted" style={styles.ratingLabel}>{rating} ★</AppText>
      <View style={[styles.ratingTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.ratingFill, { backgroundColor: theme.colors.primary, width: percent as any }]} />
      </View>
      <AppText variant="caption" tone="muted" style={styles.ratingCount}>{count}</AppText>
    </View>
  );
}

export default function ReviewSummary({ summary }: Props) {
  const { theme } = useTheme();
  const total = summary.reviewCount;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.scoreBlock}>
          <AppText variant="display">{summary.averageRating.toFixed(1)}</AppText>
          <AppText variant="captionBold" tone="warning">
            {'★'.repeat(Math.round(summary.averageRating || 0)).padEnd(5, '☆')}
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            {total} verified review{total === 1 ? '' : 's'}
          </AppText>
        </View>

        <View style={styles.bars}>
          {[5, 4, 3, 2, 1].map((rating) => (
            <RatingBar
              key={rating}
              rating={rating}
              count={summary.ratingBreakdown[rating as 1 | 2 | 3 | 4 | 5] ?? 0}
              total={total}
            />
          ))}
        </View>
      </View>

      <View style={styles.moods}>
        {SATISFACTION_OPTIONS.map((option) => (
          <View
            key={option.value}
            style={[styles.moodPill, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
          >
            <AppText variant="captionBold" tone={option.tone}>
              {option.emoji} {summary.satisfactionDistribution[option.value] ?? 0}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    gap: tokens.spacing.lg,
  },
  scoreBlock: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  ratingLabel: {
    width: 36,
  },
  ratingTrack: {
    flex: 1,
    height: 6,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  ratingFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  ratingCount: {
    width: 22,
    textAlign: 'right',
  },
  moods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  moodPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
  },
});
