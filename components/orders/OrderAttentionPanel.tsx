/**
 * Everything on an order that wants the shopper, behind ONE row.
 *
 * These used to be three stacked cards at the top of the order screen — a
 * request for more time, a lateness state, and WIEZ's notices — each with its
 * own coloured border and its own grey fill, pushing the order itself below the
 * fold. Three outlined boxes in a column is the look of a page that has nothing
 * under control, and it is what "it looks bad and stupid and too much border"
 * was describing.
 *
 * A notification is not a document. The screen now carries a single line that
 * says how many things are waiting and how urgent the worst of them is; the
 * detail and the actions live in a sheet, which is where a decision belongs on
 * a phone. Nothing is hidden — the row is loud when something is wrong — but
 * the order stays the subject of its own screen.
 *
 * Ordering is by severity, not by arrival: whatever most needs an answer sets
 * the row's tone and sits at the top of the sheet.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type AttentionTone = 'danger' | 'warning' | 'primary' | 'neutral';

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  /** Emoji marker. Rule 5: every marker in the app is an emoji. */
  marker: string;
  /** Short, in sentence case — this is a heading, not a shout. */
  title: string;
  body: string;
  /** Timestamp line, already formatted. */
  meta?: string;
  action?: {
    label: string;
    onPress: () => void;
    loading?: boolean;
  };
  /**
   * A second answer, for the items that are a question rather than a task.
   *
   * A proposed settlement is the case: "yes" and "no" are both real answers and
   * neither is a dismissal, so offering only one and expecting the shopper to
   * close the sheet to decline would quietly bias the outcome.
   */
  secondaryAction?: {
    label: string;
    onPress: () => void;
    loading?: boolean;
  };
}

const TONE_RANK: Record<AttentionTone, number> = {
  danger: 0,
  warning: 1,
  primary: 2,
  neutral: 3,
};

export function OrderAttentionPanel({ items }: { items: AttentionItem[] }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  const ordered = useMemo(
    () => [...items].sort((left, right) => TONE_RANK[left.tone] - TONE_RANK[right.tone]),
    [items],
  );

  if (ordered.length === 0) return null;

  const lead = ordered[0];
  const toneColor =
    lead.tone === 'danger'
      ? theme.colors.danger
      : lead.tone === 'warning'
        ? theme.colors.warning
        : lead.tone === 'primary'
          ? theme.colors.primary
          : theme.colors.textMuted;

  const extra = ordered.length - 1;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${ordered.length} item${ordered.length === 1 ? '' : 's'} need your attention. ${lead.title}`}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            ...tokens.elevation.sm,
          },
          pressed ? { opacity: 0.9 } : null,
        ]}
      >
        {/* A rule in the tone, not a full coloured border: urgency without
            drawing a box around it. */}
        <View style={[styles.spine, { backgroundColor: toneColor }]} />
        <AppText variant="subtitle">{lead.marker}</AppText>
        <View style={styles.copy}>
          <AppText variant="cardTitle" numberOfLines={1}>
            {lead.title}
          </AppText>
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {extra > 0 ? `${lead.body} · +${extra} more` : lead.body}
          </AppText>
        </View>
        <AppText variant="subtitle" tone="muted">
          ›
        </AppText>
      </Pressable>

      <AppBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Needs your attention"
        subtitle={`${ordered.length} update${ordered.length === 1 ? '' : 's'} on this order`}
        showCloseButton
      >
        <View style={styles.sheetBody}>
          {ordered.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.sheetItem,
                index < ordered.length - 1
                  ? {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    }
                  : null,
              ]}
            >
              <AppText variant="cardTitle">
                {item.marker} {item.title}
              </AppText>
              <AppText variant="small" tone="muted">
                {item.body}
              </AppText>
              {item.meta ? (
                <AppText variant="captionRegular" tone="muted">
                  {item.meta}
                </AppText>
              ) : null}
              {item.action || item.secondaryAction ? (
                <View style={styles.actionRow}>
                  {item.action ? (
                    <Button
                      title={item.action.label}
                      variant={item.secondaryAction ? 'primary' : 'secondary'}
                      size="sm"
                      loading={item.action.loading}
                      onPress={() => {
                        // Close first: an action that routes elsewhere must not
                        // leave a sheet open behind the destination.
                        setOpen(false);
                        item.action?.onPress();
                      }}
                      style={styles.actionButton}
                    />
                  ) : null}
                  {item.secondaryAction ? (
                    <Button
                      title={item.secondaryAction.label}
                      variant="secondary"
                      size="sm"
                      loading={item.secondaryAction.loading}
                      onPress={() => {
                        setOpen(false);
                        item.secondaryAction?.onPress();
                      }}
                      style={styles.actionButton}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingVertical: tokens.spacing.md,
    paddingRight: tokens.spacing.md,
    paddingLeft: tokens.spacing.md,
    overflow: 'hidden',
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sheetBody: {
    gap: tokens.spacing.md,
  },
  sheetItem: {
    gap: tokens.spacing.xs,
    paddingBottom: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '46%',
  },
});

export default OrderAttentionPanel;
