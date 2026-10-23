import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  title: string;
  wrapText?: boolean;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Header({ title, subtitle, left, right, actions, style, wrapText = true }: Props) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <View style={styles.body}>
          <AppText variant="title" numberOfLines={wrapText ? undefined : 1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" tone="muted" numberOfLines={wrapText ? undefined : 1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    flexWrap: 'wrap',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  side: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '100%',
  },
  body: {
    flex: 1,
    minWidth: 120,
    gap: tokens.spacing.xs,
  },
});

export default Header;
