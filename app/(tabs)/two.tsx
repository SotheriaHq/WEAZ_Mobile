import { View } from 'react-native';

import { styles } from '@/src/styles/styles';
import { AppText } from '@/components/ui/AppText';

export default function ExploreScreen() {
  return (
    <View style={styles.screen}>
      <AppText variant="h2" style={styles.title}>Threadly</AppText>
      <AppText variant="body" style={styles.body}>Explore</AppText>
    </View>
  );
}
