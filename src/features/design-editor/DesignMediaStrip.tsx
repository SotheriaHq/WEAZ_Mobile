import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import type { DesignEditorAsset } from '@/src/api/DesignApi';
import {
  DESIGN_MEDIA_SLOTS,
  getMediaViewSlotLabel,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  assets: DesignEditorAsset[];
  coverAssetId: string | null;
  onSetCover: (assetId: string) => void;
  /** Composer only — the review screen shows the set, it does not edit it. */
  onRemove?: (assetId: string) => void;
  /** Tap a photo to see it whole (review screen gallery). */
  onOpen?: (index: number) => void;
};

/**
 * The selected-media strip, exactly as the composer shows it after picking.
 * The review screen renders the same strip so a design looks the same in both
 * places; there it adds a tap-to-view gallery and drops Remove.
 */
export function DesignMediaStrip({ assets, coverAssetId, onSetCover, onRemove, onOpen }: Props) {
  const { theme } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {assets.map((asset, index) => {
        const slotLabel = asset.viewSlot ? getMediaViewSlotLabel(asset.viewSlot) : DESIGN_MEDIA_SLOTS[index];
        const isCover = asset.id === coverAssetId;
        return (
          <View key={asset.id} style={styles.card}>
            <Pressable
              onPress={onOpen ? () => onOpen(index) : undefined}
              disabled={!onOpen}
              accessibilityRole={onOpen ? 'imagebutton' : undefined}
              accessibilityLabel={onOpen ? `View ${slotLabel} photo full screen` : undefined}
              style={({ pressed }) => [styles.imageFrame, onOpen && pressed && styles.imagePressed]}
            >
              <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.preview} imageStyle={styles.preview} />
              <View style={[styles.badge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                <AppText variant="captionBold">{isCover ? `Cover · ${slotLabel}` : slotLabel}</AppText>
              </View>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => onSetCover(asset.id)}
                disabled={isCover}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: isCover }}
                accessibilityLabel={isCover ? `${slotLabel} is the cover` : `Set ${slotLabel} as the cover`}
              >
                <AppText variant="captionBold" tone={isCover ? 'muted' : 'primary'}>
                  {isCover ? 'Cover ✓' : 'Set Cover'}
                </AppText>
              </Pressable>
              {onRemove ? (
                <Pressable onPress={() => onRemove(asset.id)} hitSlop={8} accessibilityRole="button">
                  <AppText variant="captionBold" tone="danger">Remove</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
  },
  card: {
    width: 172,
    gap: tokens.spacing.sm,
  },
  imageFrame: {
    borderRadius: tokens.radius.xl,
  },
  imagePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  preview: {
    width: 172,
    height: 224,
    borderRadius: tokens.radius.xl,
  },
  badge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
});
