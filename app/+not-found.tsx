import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/src/styles/tokens';
import { AppText } from '@/components/ui/AppText';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <AppText style={styles.title}>This screen doesn't exist.</AppText>

        <Link href="/" style={styles.link}>
          <AppText style={styles.linkText}>Go to home screen!</AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: tokens.colors.dark,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: tokens.colors.lightGray,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: tokens.colors.primary,
  },
});
