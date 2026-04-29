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
      </AppText>
      {required ? (
        <AppText variant="captionBold" tone="danger">
          Required
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
});

export default RequiredFieldLabel;
