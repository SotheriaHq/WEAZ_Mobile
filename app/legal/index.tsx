import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { LEGAL_PAGES } from '@/src/legal/legalDocuments';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export default function LegalIndexScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Legal' }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/settings" />
          <View style={styles.headerCopy}>
            <AppText variant="title">Legal</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              Terms, privacy, policies
            </AppText>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {LEGAL_PAGES.map((document) => (
            <Pressable
              key={document.key}
              onPress={() => router.push(`/legal/${document.slug}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`View ${document.title}`}
            >
              <Card style={styles.card}>
                <AppText variant="bodyBold">{document.title}</AppText>
                <AppText variant="caption" tone="muted">{document.summary}</AppText>
                <AppText variant="captionBold" tone="primary">Version {document.version}</AppText>
              </Card>
            </Pressable>
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
});
