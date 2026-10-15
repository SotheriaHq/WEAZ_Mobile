import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { contentIntegrityApi, type ContentReviewDecision } from '@/src/api/ContentIntegrityApi';
import { getContentStatusLabel } from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MuseLoader } from '@/components/ui/MuseLoader';

interface ContentReviewDecisionSheetProps {
  open: boolean;
  onClose: () => void;
  submissionId?: string | null;
  status?: string | null;
  title?: string | null;
  onEdit?: () => void;
}

const slotLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export function ContentReviewDecisionSheet({
  open,
  onClose,
  submissionId,
  status,
  title,
  onEdit,
}: ContentReviewDecisionSheetProps) {
  const { theme } = useTheme();
  const [decision, setDecision] = useState<ContentReviewDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedStatus = String(status ?? decision?.status ?? '').toUpperCase();
  const isRejected = normalizedStatus === 'REJECTED';

  useEffect(() => {
    let mounted = true;
    if (!open || !submissionId) {
      setDecision(null);
      return;
    }

    setLoading(true);
    contentIntegrityApi.getMySubmission(submissionId)
      .then((payload) => {
        if (mounted) setDecision(payload);
      })
      .catch(() => {
        if (mounted) setDecision(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, submissionId]);

  const missingSlots = decision?.slotCompleteness?.missing ?? [];

  return (
    // The app's sheet. It was a transparent Modal on the platform's own slide,
    // so a brand reading why their submission was rejected got a panel that
    // opened unlike every other panel in the studio, and could not be swiped
    // away.
    <AppBottomSheet
      visible={open}
      title={isRejected ? 'Rejected' : 'Changes requested'}
      subtitle={
        isRejected
          ? 'This submission was not approved.'
          : 'Please update the highlighted media and resubmit.'
      }
      onClose={onClose}
      showCloseButton
      footer={
        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
          >
            <AppText variant="bodyBold" tone="primary">Close</AppText>
          </Pressable>
          {onEdit ? (
            <Pressable
              onPress={() => {
                onClose();
                onEdit();
              }}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            >
              <AppText variant="bodyBold" tone="inverse">Edit and Resubmit</AppText>
            </Pressable>
          ) : null}
        </View>
      }
    >
          <AppText variant="caption" tone="muted">
            {title || 'This item'} is marked as {getContentStatusLabel(normalizedStatus)}.
          </AppText>

          {loading ? (
            <View style={styles.loading}>
              <MuseLoader size={20} />
            </View>
          ) : (
            <View style={[styles.reasonBox, { borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">
                Reviewer reason
              </AppText>
              <AppText variant="bodyBold" tone="primary" style={styles.reasonText}>
                {decision?.reasonLabel || 'Reviewer feedback is not available yet.'}
              </AppText>
              {decision?.reasonNote ? (
                <AppText variant="body" tone="secondary" style={styles.copy}>
                  {decision.reasonNote}
                </AppText>
              ) : null}
              {missingSlots.length > 0 ? (
                <AppText variant="caption" tone="danger" style={styles.copy}>
                  Missing media: {missingSlots.map(slotLabel).join(', ')}
                </AppText>
              ) : null}
            </View>
          )}

    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  copy: {
    marginTop: tokens.spacing.xs,
  },
  loading: {
    minHeight: 96,
    justifyContent: 'center',
  },
  reasonBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  reasonText: {
    marginTop: tokens.spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
