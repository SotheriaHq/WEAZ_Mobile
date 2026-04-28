import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { BrandHeader } from '@/components/ui/BrandHeader';
import { BrandShopTab } from '@/components/catalog/BrandShopTab';
import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';

export default function StoreTabScreen() {
  const { user } = useAuth();
  const { theme, scheme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  const isBrand = user?.type === 'BRAND';

  if (!isBrand) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}> 
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <BrandHeader />
        <View style={styles.guestWrap}>
          <AppText style={[styles.guestTitle, { color: theme.colors.text }]}>Store is brand-only on this tab</AppText>
          <AppText style={[styles.guestBody, { color: theme.colors.textMuted }]}>Visit brand catalogs from Market to explore products.</AppText>
          <Pressable
            onPress={() => router.replace('/(tabs)/discover')}
            style={[styles.guestBtn, { backgroundColor: theme.colors.primary }]}
          >
            <AppText style={styles.guestBtnText}>Open market</AppText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}> 
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <BrandHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onLayout={(event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width)}
      >
        <View style={styles.heroBlock}>
          <AppText style={[styles.heroTitle, { color: theme.colors.text }]}>Brand Store</AppText>
          <AppText style={[styles.heroBody, { color: theme.colors.textMuted }]}>Owner storefront workspace with buyer-grade interactions for save, bag, and custom bag flows.</AppText>
        </View>

        {containerWidth > 0 ? (
          <BrandShopTab brandId={user?.id} isOwner containerWidth={containerWidth} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 110,
  },
  heroBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  guestWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  guestBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  guestBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  guestBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
