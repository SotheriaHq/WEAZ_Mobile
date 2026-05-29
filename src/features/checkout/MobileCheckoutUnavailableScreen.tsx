import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { getMobileCheckoutUnavailableMessage } from '@/src/features/checkout/mobileCheckoutGate';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  title?: string;
};

export function MobileCheckoutUnavailableScreen({ title = 'Checkout unavailable' }: Props) {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.container}>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="title" style={styles.centerText}>
              Checkout is temporarily unavailable
            </AppText>
            <AppText variant="body" tone="muted" style={styles.centerText}>
              {getMobileCheckoutUnavailableMessage()}
            </AppText>
            <View style={styles.actions}>
              <Button title="Continue browsing" onPress={() => router.replace('/(tabs)' as never)} />
              <Button title="View orders" variant="secondary" onPress={() => router.replace('/orders' as never)} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

export default MobileCheckoutUnavailableScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
});
