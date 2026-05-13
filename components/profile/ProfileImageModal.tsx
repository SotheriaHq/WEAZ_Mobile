import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { StableImage } from '@/components/ui/StableImage';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

type ProfileImageModalProps = {
  visible: boolean;
  imageUrl?: string | null;
  onClose: () => void;
};

export function ProfileImageModal({ visible, imageUrl, onClose }: ProfileImageModalProps) {
  const { scheme } = useTheme();
  const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0;

  useAndroidOverlaySystemBars(visible && hasImage, scheme, 'profile-image-modal');

  if (!visible || !hasImage) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.centerWrap} pointerEvents="box-none">
          <BlurView intensity={35} tint="dark" style={styles.panel}>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close profile image">
              <AppText variant="smallBold">✖️</AppText>
            </Pressable>

            <View style={styles.imageWrap}>
              <StableImage
                uri={imageUrl}
                resizeMode="contain"
                containerStyle={styles.imageLayer}
                imageStyle={styles.imageLayer}
                fallback={<View style={styles.fallback} />}
                fadeDuration={120}
              />
            </View>
          </BlurView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerWrap: {
    width: '94%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  panel: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 10,
    backgroundColor: 'rgba(18, 18, 24, 0.78)',
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  imageWrap: {
    marginTop: 6,
    width: '100%',
    height: '92%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  imageLayer: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

export default ProfileImageModal;
