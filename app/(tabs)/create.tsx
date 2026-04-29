import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/ui/BrandHeader';
import { AppText } from '@/components/ui/AppText';

export default function CreateScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <BrandHeader />
      <View style={styles.inner}>
        <AppText variant="title">Create</AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
