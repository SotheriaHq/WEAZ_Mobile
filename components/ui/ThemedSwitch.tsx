import React from 'react';
import { StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

export function ThemedSwitch(props: SwitchProps) {
  const { theme } = useTheme();
  const { disabled, value } = props;

  return (
    <View style={[styles.touchTarget, disabled ? styles.disabled : null]}>
      <Switch
        {...props}
        trackColor={{
          false: theme.colors.surfaceAlt,
          true: theme.colors.primary,
        }}
        thumbColor={value ? theme.colors.textInverse : theme.colors.textMuted}
        ios_backgroundColor={theme.colors.surfaceAlt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    minWidth: 52,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.48,
  },
});

export default ThemedSwitch;
