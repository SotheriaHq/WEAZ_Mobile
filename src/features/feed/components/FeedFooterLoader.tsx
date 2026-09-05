import { StyleSheet, View } from 'react-native';

import { MuseLoader } from '@/components/ui/MuseLoader';

export function FeedFooterLoader() {
  return (
    <View style={styles.root}>
      <MuseLoader size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
