import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ReviewDto } from '@/src/api/ReviewApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { formatEditWindow, formatReviewDate, getSatisfactionOption, targetLabel } from './reviewDisplay';

type Props = {
  review: ReviewDto;
  currentUserId?: string | null;
  onEdit?: (review: ReviewDto) => void;
  onDelete?: (review: ReviewDto) => void;
};

export default function ReviewCard({ review, currentUserId, onEdit, onDelete }: Props) {
  const { theme } = useTheme();
  const mood = getSatisfactionOption(review.satisfaction);
  const isOwner = Boolean(currentUserId && review.reviewerId === currentUserId);
  const canEdit = Boolean(review.canEdit && isOwner);
  const canDelete = Boolean(review.canDelete && isOwner);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <AppText variant="bodyBold" numberOfLines={1}>Verified buyer</AppText>
            {review.verifiedPurchase ? (
              <View style={[styles.verifiedPill, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
                <AppText variant="captionBold" tone="success">Verified</AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="captionRegular" tone="muted">
            {formatReviewDate(review.createdAt)} · {targetLabel(review.targetType)}
          </AppText>
        </View>

        <View style={styles.score}>
          <AppText variant="captionBold" tone="warning">
            {'★'.repeat(Math.max(0, Math.min(5, review.rating))).padEnd(5, '☆')}
          </AppText>
          <AppText variant="captionBold" tone={mood.tone}>
            {mood.emoji} {mood.label}
          </AppText>
        </View>
      </View>

      {review.reviewText ? (
        <AppText variant="body" tone="secondary" style={styles.body}>
          {review.reviewText}
        </AppText>
      ) : (
        <AppText variant="body" tone="muted" style={styles.body}>
          No written review.
        </AppText>
      )}

      {review.editedAt ? (
        <AppText variant="captionRegular" tone="muted">Edited</AppText>
      ) : null}

      {isOwner ? (
        <View style={[styles.actionsRow, { borderTopColor: theme.colors.border }]}>
          <AppText variant="captionRegular" tone="muted" style={styles.editHint}>
            {formatEditWindow(review.editWindowExpiresAt)}
          </AppText>
          <View style={styles.actions}>
            {canEdit ? (
              <Pressable
                onPress={() => onEdit?.(review)}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="captionBold">Edit</AppText>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable
                onPress={() => onDelete?.(review)}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor: theme.colors.danger, backgroundColor: theme.colors.surface },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="captionBold" tone="danger">Delete</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  verifiedPill: {
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 2,
  },
  score: {
    alignItems: 'flex-end',
    gap: 2,
  },
  body: {
    marginTop: tokens.spacing.xs,
  },
  actionsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  editHint: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
});
