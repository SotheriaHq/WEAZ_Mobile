import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

export default function LocationSettingsScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const handleShareLocation = React.useCallback(() => {
    toast.info('Location sharing is coming soon.');
  }, [toast]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Location</AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            Device location access
          </AppText>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <Button
          title="Back to settings"
          variant="ghost"
          onPress={() => router.replace('/settings' as never)}
          left={<AppText variant="body">👈</AppText>}
          style={styles.backAction}
        />

        <Card padding="xl" style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySoft }]}>
            <AppText variant="h2">📍</AppText>
          </View>
          <AppText variant="h2">Share your location?</AppText>
          <AppText variant="body" tone="muted">
            Threadly will ask before using your device location. Your precise location will not be shared with brands or other users from this screen.
          </AppText>
          <Button title="Share location" onPress={handleShareLocation} fullWidth />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  backAction: {
    alignSelf: 'flex-start',
  },
  card: {
    gap: tokens.spacing.lg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
