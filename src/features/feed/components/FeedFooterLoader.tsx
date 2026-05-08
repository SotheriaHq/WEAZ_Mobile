import { StyleSheet, View } from 'react-native';

import ThreadlyLogoLoader from '@/components/ui/ThreadlyLogoLoader';

export function FeedFooterLoader() {
  return (
    <View style={styles.root}>
      <ThreadlyLogoLoader size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
