import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export function SettingsSectionHeading({ title }: { title: string }) {
  const { theme } = useTheme();
  return <View style={styles.heading}>
    <AppText variant="bodyBold" tone="secondary" accessibilityRole="header" style={styles.label}>{title}</AppText>
    <View accessible={false} style={[styles.rule, { backgroundColor: theme.colors.border }]} />
  </View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  label: { flexShrink: 1 },
  rule: { height: 2, flexGrow: 1, minWidth: tokens.spacing.xl },
});
