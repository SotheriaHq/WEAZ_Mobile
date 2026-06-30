import { StyleSheet, View } from 'react-native';

import WiezLogoLoader from '@/components/ui/WiezLogoLoader';

export function FeedFooterLoader() {
  return (
    <View style={styles.root}>
      <WiezLogoLoader size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
