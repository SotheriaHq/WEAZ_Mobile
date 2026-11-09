import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ReviewFeedback, ReviewFocus } from '@/src/features/content-review/reviewFeedback';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const FOCUS_LABEL: Record<ReviewFocus, string> = {
  media: 'Look at: your photos',
  details: 'Look at: category and details',
  listing: 'Look at: the listing as a whole',
};

/**
 * What the reviewer asked for, at the top of the editor and above the
 * resubmit button: the reason, their note, what to do, and where.
 */
export function ReviewFeedbackCard({ feedback }: { feedback: ReviewFeedback }) {
  const { theme } = useTheme();
  const changes = feedback.status === 'CHANGES_REQUESTED';
  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { borderColor: theme.colors.warning, backgroundColor: theme.colors.surfaceAlt }]}
    >
      <AppText variant="bodyBold" tone="warning">
        {changes ? '✏️ Changes requested' : '⛔ Not approved this time'}
      </AppText>
      {feedback.reasonLabel ? <AppText variant="bodyBold">{feedback.reasonLabel}</AppText> : null}
      {feedback.reasonNote ? (
        <AppText variant="notification" tone="secondary" italic>
          “{feedback.reasonNote}”
        </AppText>
      ) : null}
      <AppText variant="captionRegular">{feedback.guidance}</AppText>
      <AppText variant="captionBold" tone="muted">
        {FOCUS_LABEL[feedback.focus]} · then tap Resubmit for review
      </AppText>
    </View>
  );
}

/**
 * The same feedback, small, beside the section it points at — so the brand
 * finds the field without hunting for it.
 */
export function ReviewFieldHint({
  feedback,
  focus,
}: {
  feedback: ReviewFeedback | null;
  focus: ReviewFocus;
}) {
  const { theme } = useTheme();
  if (!feedback || feedback.focus !== focus) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Reviewer: ${feedback.reasonLabel ?? 'changes requested here'}`}
      style={[styles.hint, { borderColor: theme.colors.warning }]}
    >
      <AppText variant="captionBold" tone="warning">
        ✏️ Reviewer: {feedback.reasonLabel ?? 'changes requested here'}
      </AppText>
      <AppText variant="captionRegular" tone="muted">
        {feedback.guidance}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
  },
  hint: {
    gap: 2,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
  },
});
