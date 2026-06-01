import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { contentIntegrityApi, type ContentReviewDecision } from '@/src/api/ContentIntegrityApi';
import { getContentStatusLabel } from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

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
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <AppText variant="title" tone={isRejected ? 'danger' : 'primary'}>
            {isRejected ? 'Rejected' : 'Changes requested'}
          </AppText>
          <AppText variant="body" tone="secondary" style={styles.copy}>
            {isRejected
              ? 'This submission was not approved.'
              : 'Please update the highlighted media and resubmit.'}
          </AppText>
          <AppText variant="caption" tone="muted">
            {title || 'This item'} is marked as {getContentStatusLabel(normalizedStatus)}.
          </AppText>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.primary} />
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
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
