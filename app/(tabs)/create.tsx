import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { AppText } from '@/components/ui/AppText';

export default function CreateScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <BrandHeader />
      <View style={styles.inner}>
        <AppText style={[styles.title, { color: theme.colors.text }]}>Create</AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
});
