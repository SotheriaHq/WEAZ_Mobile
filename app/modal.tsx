import { View } from 'react-native';

import { styles } from '@/src/styles/styles';
import { AppText } from '@/components/ui/AppText';

export default function ModalScreen() {
  return (
    <View style={styles.screen}>
      <AppText variant="h2" style={styles.title}>WEAZ</AppText>
      <AppText variant="body" style={styles.body}>Info</AppText>
    </View>
  );
}
