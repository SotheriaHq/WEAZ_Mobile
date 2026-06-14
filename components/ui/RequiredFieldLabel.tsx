import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

type Props = {
  children: React.ReactNode;
  required?: boolean;
};

export function RequiredFieldLabel({ children, required = false }: Props) {
  return (
    <View style={styles.row}>
      <AppText variant="captionBold" tone="secondary">
        {children}
        {required ? (
          // Inline red asterisk — no spelled-out "Required" text, no detached
          // required checklist (Issue #3).
          <AppText variant="captionBold" tone="danger"> *</AppText>
        ) : null}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
});

export default RequiredFieldLabel;
