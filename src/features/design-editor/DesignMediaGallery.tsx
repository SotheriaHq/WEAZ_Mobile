import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import type { DesignEditorAsset } from '@/src/api/DesignApi';
import {
  DESIGN_MEDIA_SLOTS,
  getMediaViewSlotLabel,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';

type Props = {
  visible: boolean;
  assets: DesignEditorAsset[];
  initialIndex: number;
  coverAssetId: string | null;
  onSetCover: (assetId: string) => void;
  onClose: () => void;
};

const STAGE = tokens.themes.dark.colors;

/**
 * Full-screen look at the design's photos before submitting: each photo shown
 * whole (contain, never cropped), swipe between them, and set the cover from
 * here too. Always on the dark stage so photos read the same in either theme.
 */
export function DesignMediaGallery({ visible, assets, initialIndex, coverAssetId, onSetCover, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<DesignEditorAsset>>(null);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [initialIndex, visible]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      setIndex(Math.max(0, Math.min(assets.length - 1, next)));
    },
    [assets.length, width],
  );

  const asset = assets[index] ?? null;
  const slotLabel = asset
    ? asset.viewSlot
      ? getMediaViewSlotLabel(asset.viewSlot)
      : DESIGN_MEDIA_SLOTS[index]
    : '';
  const isCover = Boolean(asset && asset.id === coverAssetId);

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent transparent={false}>
      <View style={[styles.root, { backgroundColor: STAGE.runwayStage }]}>
        <FlatList
          ref={listRef}
          data={assets}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, Math.max(assets.length - 1, 0))}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <ExpoImage
                source={{ uri: item.remoteUrl ?? item.uri }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
                style={StyleSheet.absoluteFill}
                accessibilityLabel={item.viewSlot ? `${getMediaViewSlotLabel(item.viewSlot)} photo` : 'Design photo'}
              />
            </View>
          )}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + tokens.spacing.sm }]} pointerEvents="box-none">
          <View style={[styles.pill, { backgroundColor: STAGE.surfaceOverlay }]}>
            <AppText variant="captionBold" onDarkStage>
              {assets.length > 0 ? `${index + 1} / ${assets.length} · ${slotLabel}` : ''}
            </AppText>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close gallery"
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: STAGE.surfaceOverlay, transform: [{ scale: pressed ? 0.94 : 1 }] },
            ]}
          >
            <AppText variant="bodyBold" onDarkStage>✕</AppText>
          </Pressable>
        </View>

        {asset ? (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + tokens.spacing.lg }]} pointerEvents="box-none">
            <Pressable
              onPress={() => onSetCover(asset.id)}
              disabled={isCover}
              accessibilityRole="button"
              accessibilityState={{ selected: isCover }}
              accessibilityLabel={isCover ? `${slotLabel} is the cover` : `Set ${slotLabel} as the cover`}
              style={({ pressed }) => [
                styles.coverButton,
                {
                  backgroundColor: isCover ? STAGE.surfaceOverlay : STAGE.primary,
                  transform: [{ scale: pressed && !isCover ? 0.96 : 1 }],
                },
              ]}
            >
              <AppText variant="bodyBold" onDarkStage tone={isCover ? 'secondary' : 'inverse'}>
                {isCover ? 'Cover photo ✓' : 'Set as cover'}
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
  },
  pill: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  coverButton: {
    minHeight: 48,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
