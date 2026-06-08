import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LEGAL_PAGE_BY_SLUG } from '@/src/legal/legalDocuments';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export default function LegalDocumentScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const document = LEGAL_PAGE_BY_SLUG.get(slug);

  if (!document) {
    return (
      <>
        <Stack.Screen options={{ title: 'Legal' }} />
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]} edges={['top']}>
          <View style={styles.center}>
            <Card style={styles.card}>
              <AppText variant="title" style={styles.centerText}>Document unavailable</AppText>
              <Button title="Back to legal" onPress={() => router.replace('/legal' as never)} />
            </Card>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: document.title }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/legal" />
          <View style={styles.headerCopy}>
            <AppText variant="title" numberOfLines={1}>{document.title}</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              Version {document.version}
            </AppText>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.card}>
            <AppText variant="captionBold" tone="primary">
              Draft effective date: {document.effectiveDate}
            </AppText>
            <AppText variant="body" tone="muted">
              {document.summary}
            </AppText>
            <AppText variant="caption" tone="warning">
              Counsel review required before public launch.
            </AppText>
          </Card>

          {document.sections.map((section) => (
            <Card key={section.heading} style={styles.card}>
              <AppText variant="subtitle">{section.heading}</AppText>
              <AppText variant="body" tone="muted">{section.body}</AppText>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
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
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl2,
  },
  card: {
    gap: tokens.spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  centerText: {
    textAlign: 'center',
  },
});
