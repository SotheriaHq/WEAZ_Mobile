import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type GuideSection = {
  id: string;
  label: string;
  title: string;
  body: string[];
};

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Size labels are guides',
    body: [
      'XL, XXL, 2XL, 3XL, and numeric labels vary across brands, regions, fabrics, and cuts.',
      'WEAZ recommendations come from your saved measurements and approved structured chart data.',
      'You can always change the recommended size before ordering.',
    ],
  },
  {
    id: 'ng',
    label: 'Nigeria/West Africa',
    title: 'No universal Nigerian chart',
    body: [
      'WEAZ does not use one universal Nigerian size chart.',
      'Nigeria/West Africa support is body-measurement-first and can use product, brand, vendor, regional, UK, US, EU, or International mappings where appropriate.',
      'African brands can define approved structured charts for their own garments.',
    ],
  },
  {
    id: 'international',
    label: 'International',
    title: 'Alpha labels vary',
    body: [
      'International alpha sizes such as XS, S, M, L, XL, XXL, 3XL, and 4XL are display labels, not universal measurements.',
      'A relaxed XL and a slim XL can feel very different.',
    ],
  },
  {
    id: 'uk',
    label: 'UK',
    title: 'UK labels need chart context',
    body: [
      'UK sizing is common in Nigeria and West African retail contexts, but brand charts still matter.',
      'WEAZ displays UK labels when selected, while backend recommendations compare normalized measurements with approved ranges.',
    ],
  },
  {
    id: 'us',
    label: 'US',
    title: 'US labels are not direct formulas',
    body: [
      'US labels can differ from UK and EU labels by category and brand.',
      'WEAZ treats US as a chart and display preference, not a client-side formula.',
    ],
  },
  {
    id: 'eu',
    label: 'EU',
    title: 'EU labels are another chart family',
    body: [
      'EU numeric labels can be useful for global buyers.',
      'They must come from approved structured chart rows before they are used operationally.',
    ],
  },
  {
    id: 'garments',
    label: 'Garments',
    title: 'Different garments need different measurements',
    body: [
      'Tops rely on chest or bust, shoulder, waist, sleeve length, and height.',
      'Bottoms rely on waist, hip or seat, inseam, and height.',
      'Gowns and dresses use bust, waist, hip, and length together. Formal shirts also need neck or collar.',
    ],
  },
  {
    id: 'measurements',
    label: 'Measurements',
    title: 'Accurate measurements improve confidence',
    body: [
      'Minimum baseline: height, chest or bust, waist, hip or seat, and shoulder.',
      'Strongly recommended: sleeve length, inseam, and neck or collar.',
      'Use a flexible tape, keep it level, and get help measuring if possible.',
    ],
  },
  {
    id: 'limitations',
    label: 'Limitations',
    title: 'Recommendations are estimates',
    body: [
      'Fit may vary because of brand grading, fabric stretch, garment cut, production tolerance, and personal preference.',
      'Educational chart content is not operational chart data. Backend recommendations use structured, approved, versioned chart rows.',
    ],
  },
];

export default function SizeGuideScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const active = useMemo(
    () => SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0],
    [activeId],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppBackButton />
        <View style={styles.headerCopy}>
          <AppText variant="h2">Size Guide / Charts</AppText>
          <AppText variant="body" tone="muted">
            Sizing systems, measurements, and WEAZ recommendation limits.
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {SECTIONS.map((section) => {
            const selected = section.id === activeId;
            return (
              <Pressable
                key={section.id}
                onPress={() => setActiveId(section.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <AppText variant="captionBold" tone={selected ? 'primary' : 'secondary'}>{section.label}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <Card padding="md" style={styles.card}>
          <AppText variant="h2">{active.title}</AppText>
          {active.body.map((paragraph) => (
            <AppText key={paragraph} variant="body" tone="secondary">
              {paragraph}
            </AppText>
          ))}
          <View style={[styles.notice, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <AppText variant="captionRegular" tone="muted">
              This guide is educational. Product recommendations are computed by the backend from approved operational chart data, not this text.
            </AppText>
          </View>
          <Button title="Update my measurements" onPress={() => router.push('/(tabs)/me' as any)} />
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
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  tabs: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  tab: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  card: {
    gap: tokens.spacing.md,
  },
  notice: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  pressed: {
    opacity: 0.74,
  },
});
