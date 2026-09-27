import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';

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
              Effective date: {document.effectiveDate}
            </AppText>
            <AppText variant="body" tone="muted">
              {document.summary}
            </AppText>
          </Card>

          <Card style={styles.card}>
            <Markdown
              style={{
                body: { color: theme.colors.text, fontSize: tokens.typography.bodyReadable.size, lineHeight: tokens.typography.bodyReadable.lineHeight },
                heading1: { color: theme.colors.text, fontSize: tokens.typography.h2.size, fontWeight: '700', marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.sm },
                heading2: { color: theme.colors.text, fontSize: tokens.typography.cardTitle.size, fontWeight: '700', marginTop: tokens.spacing.md, marginBottom: tokens.spacing.xs },
                heading3: { color: theme.colors.text, fontSize: tokens.typography.body.size, fontWeight: '600', marginTop: tokens.spacing.md, marginBottom: tokens.spacing.xs },
                paragraph: { marginTop: tokens.spacing.xs, marginBottom: tokens.spacing.sm },
                link: { color: theme.colors.primary },
                bullet_list: { marginVertical: tokens.spacing.xs },
                ordered_list: { marginVertical: tokens.spacing.xs },
                hr: { backgroundColor: theme.colors.border, height: StyleSheet.hairlineWidth, marginVertical: tokens.spacing.md },
                code_inline: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.primary, paddingHorizontal: tokens.spacing.xs, borderRadius: tokens.radius.sm },
                /*
                  Rules between rows, not a box around every cell.

                  These documents now carry real tables — the retention
                  schedules and the cookie directory used to be drawn with box
                  characters inside a code fence, which on a phone was a
                  monospace panel that scrolled sideways. A cell grid would
                  reintroduce most of that noise: it draws four lines per cell
                  to express one separation.
                */
                table: { borderColor: theme.colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.md, overflow: 'hidden', marginVertical: tokens.spacing.sm },
                thead: { backgroundColor: theme.colors.surfaceAlt },
                th: { padding: tokens.spacing.sm, fontWeight: '700' },
                tr: { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                td: { padding: tokens.spacing.sm },
              }}
            >
              {document.content}
            </Markdown>
          </Card>
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
