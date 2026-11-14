import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { StableImage } from '@/components/ui/StableImage';
import { AppText } from '@/components/ui/AppText';
import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { tokens } from '@/src/styles/tokens';

const CLOSE_GLASS_SIZE = { width: 34, height: 34 } as const;

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
          <WiezLiquidGlass
            mode="lightweight"
            intensity="prominent"
            tintMode="dark"
            tintAlpha={tokens.liquidGlass.fallbackTint.stageChrome}
            borderRadius={24}
            style={styles.panel}
            contentStyle={styles.panelContent}
          >
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close profile image">
              <WiezLiquidGlass
                mode="lightweight"
                intensity="regular"
                tintMode="dark"
                tintAlpha={tokens.liquidGlass.fallbackTint.modalSoft}
                borderRadius={17}
                initialSize={CLOSE_GLASS_SIZE}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
              <AppText variant="smallBold" tone="inverse">✖️</AppText>
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
          </WiezLiquidGlass>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.scrim(0.75),
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
    borderWidth: 0,
  },
  panelContent: {
    width: '100%',
    height: '100%',
    padding: 12,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    marginTop: 4,
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
    ...StyleSheet.absoluteFill,
    backgroundColor: tokens.tintLight(0.06),
  },
});

export default ProfileImageModal;
