import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import { useAuth } from '@/src/auth/AuthContext';
import { env } from '@/src/config/env';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  SettingsHeader,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

function buildHelpUrl(path: string) {
  try {
    return new URL(path, env.webAppUrl).toString();
  } catch {
    return env.webAppUrl;
  }
}

export default function SupportSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [problemSummary, setProblemSummary] = useState('');

  const reportText = useMemo(() => {
    const summary = problemSummary.trim();
    return [
      'WIEZ support report',
      `Created: ${new Date().toISOString()}`,
      `User ID: ${user?.id ?? 'unknown'}`,
      `Email: ${user?.email ?? 'unknown'}`,
      `Account type: ${user?.type ?? 'unknown'}`,
      '',
      summary ? `Issue: ${summary}` : 'Issue: ',
    ].join('\n');
  }, [problemSummary, user?.email, user?.id, user?.type]);

  const copyReport = useCallback(async () => {
    if (!problemSummary.trim()) {
      toast.error('Write a short problem summary first.');
      return;
    }

    await Clipboard.setStringAsync(reportText);
    toast.success('Report details copied.');
  }, [problemSummary, reportText, toast]);

  const openWebHelp = useCallback((path: string) => {
    void WebBrowser.openBrowserAsync(buildHelpUrl(path)).catch(() => {
      toast.error('Unable to open help in the browser.');
    });
  }, [toast]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Support" subtitle="Help, reports, and account paths" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Fast help">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Choose the right support path</AppText>
            <AppText variant="captionRegular" tone="muted">
              Native support tickets are not exposed by this backend yet, so this screen routes you to the backend-backed account, order, and legal areas available now.
            </AppText>
            <View style={styles.buttonGrid}>
              <View style={styles.buttonSlot}>
                <Button title="Orders" variant="secondary" onPress={() => drillDownPush('/orders' as never)} />
              </View>
              <View style={styles.buttonSlot}>
                <Button title="Account" variant="secondary" onPress={() => drillDownPush('/settings/account-security' as never)} />
              </View>
            </View>
            <View style={styles.buttonGrid}>
              <View style={styles.buttonSlot}>
                <Button title="Payments" variant="secondary" onPress={() => drillDownPush('/settings/payment' as never)} />
              </View>
              <View style={styles.buttonSlot}>
                <Button title="Legal" variant="secondary" onPress={() => drillDownPush('/legal' as never)} />
              </View>
            </View>
          </Card>
        </SettingsSection>

        <SettingsSection title="Report details">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Prepare a problem report</AppText>
            <AppText variant="captionRegular" tone="muted">
              Add a short summary and copy a report with your account context. This does not send anything until a backend support endpoint exists.
            </AppText>
            <Input
              label="What went wrong?"
              value={problemSummary}
              onChangeText={setProblemSummary}
              placeholder="Describe the screen, action, and error"
              multiline
            />
            <Button
              title="Copy report details"
              onPress={() => void copyReport()}
              disabled={!problemSummary.trim()}
            />
          </Card>
        </SettingsSection>

        <SettingsSection title="Guides">
          <Card padding="lg" style={styles.card}>
            <AppText variant="bodyBold">Web help and policies</AppText>
            <AppText variant="captionRegular" tone="muted">
              Open the available web help or review policies that govern shopper orders, payments, privacy, and safety.
            </AppText>
            <Button
              title="Open web help"
              variant="secondary"
              onPress={() => openWebHelp('/help/verified-badge')}
            />
            <Button
              title="Payment policy"
              variant="outline"
              onPress={() => drillDownPush('/legal/payment-policy' as never)}
            />
            <Button
              title="Trust and safety"
              variant="outline"
              onPress={() => drillDownPush('/legal/trust-safety-policy' as never)}
            />
          </Card>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.md,
  },
  buttonGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  buttonSlot: {
    flex: 1,
    minWidth: 0,
  },
});
