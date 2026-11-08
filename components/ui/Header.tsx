import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  title: React.ReactNode;
  wrapText?: boolean;
  /**
   * Keep everything on one row: the title shrinks (one line) instead of the
   * actions wrapping onto a second row under it. For headers whose actions
   * must stay beside the title (the Studio store header).
   */
  singleRow?: boolean;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Header({ title, subtitle, left, right, actions, style, wrapText = true, singleRow = false }: Props) {
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
      <View style={[styles.row, singleRow && styles.rowSingle]}>
        <View style={styles.side}>{left}</View>
        <View style={[styles.body, singleRow && styles.bodySingle]}>
          {typeof title === 'string' ? (
            <AppText variant="title" numberOfLines={wrapText ? undefined : 1}>
              {title}
            </AppText>
          ) : (
            title
          )}
          {subtitle ? (
            <AppText variant="caption" tone="muted" numberOfLines={wrapText ? undefined : 1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.side, styles.sideRight, singleRow && styles.sideRightSingle]}>{right}</View>
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
  rowSingle: {
    flexWrap: 'nowrap',
    gap: tokens.spacing.sm,
  },
  bodySingle: {
    minWidth: 0,
    flexShrink: 1,
  },
  sideRightSingle: {
    flexShrink: 0,
  },
});

export default Header;
