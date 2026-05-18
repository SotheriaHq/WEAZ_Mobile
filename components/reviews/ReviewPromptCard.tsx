import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ReviewPromptDto } from '@/src/api/ReviewApi';
import { tokens } from '@/src/styles/tokens';
import { promptTitle, targetLabel } from './reviewDisplay';

type Props = {
  prompt: ReviewPromptDto;
  onReview: (prompt: ReviewPromptDto) => void;
  onSkip: (prompt: ReviewPromptDto) => void;
  skipping?: boolean;
};

export default function ReviewPromptCard({ prompt, onReview, onSkip, skipping = false }: Props) {
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.copy}>
        <AppText variant="bodyBold">{promptTitle(prompt)}</AppText>
        <AppText variant="captionRegular" tone="muted">
          Share an optional verified review for this completed {targetLabel(prompt.targetType)}.
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button title="Write review" size="sm" onPress={() => onReview(prompt)} />
        <Button title="Skip" size="sm" variant="secondary" loading={skipping} onPress={() => onSkip(prompt)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
  },
  copy: {
    gap: tokens.spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
});
