import { StyleSheet, View } from 'react-native';

import WeazLogoLoader from '@/components/ui/WeazLogoLoader';

export function FeedFooterLoader() {
  return (
    <View style={styles.root}>
      <WeazLogoLoader size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
