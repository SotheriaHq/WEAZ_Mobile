import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';

type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function ComposerSection({ title, subtitle, children }: Props) {
  return (
    <Card padding="lg" style={styles.card}>
      {title || subtitle ? (
        <View style={styles.header}>
          {title ? <AppText variant="bodyBold">{title}</AppText> : null}
          {subtitle ? (
            <AppText variant="captionRegular" tone="muted">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
  },
  header: {
    gap: tokens.spacing.xs,
  },
});

export default ComposerSection;
