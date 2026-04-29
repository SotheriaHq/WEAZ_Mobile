import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ProductBagStatus } from '@/src/api/StoreApi';

type BagProductInput = {
  id: string;
  name?: string;
};

type Props = {
  visible: boolean;
  product: BagProductInput | null;
  status: ProductBagStatus | null;
  onClose: () => void;
};

export default function ProductBagSelectorSheet({ visible, product, status, onClose }: Props) {
  const { theme } = useTheme();
  const { addStandard, loadingByProductId } = useMobileBagging();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!visible) return;
    setSelectedSize(status?.standard.selectedSize ?? null);
    setSelectedColor(status?.standard.selectedColor ?? null);
    setQuantity(1);
  }, [status, visible]);

  const isLoading = Boolean(product && loadingByProductId[product.id]);
  const requiresSize = Boolean(status?.standard.requiresSize);
  const requiresColor = Boolean(status?.standard.requiresColor);

  const canSubmit = useMemo(() => {
    if (!product || !status) return false;
    if (requiresSize && !selectedSize) return false;
    if (requiresColor && !selectedColor) return false;
    return !isLoading;
  }, [isLoading, product, requiresColor, requiresSize, selectedColor, selectedSize, status]);

  const handleSubmit = async () => {
    if (!product || !status) return;
    await addStandard({
      productId: product.id,
      qty: quantity,
      size: selectedSize ?? undefined,
      color: selectedColor ?? undefined,
    });
    onClose();
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={`Select options for ${product?.name || 'this item'}`}
      subtitle={status?.ui.disabledReason || 'Choose the right size and color before adding this item to your bag.'}
      onClose={onClose}
      showCloseButton
      onDone={handleSubmit}
      doneLabel="Add to bag"
      doneDisabled={!canSubmit}
      loading={isLoading}
    >
      <View style={styles.group}>
        {requiresSize ? (
          <View style={styles.section}>
            <AppText variant="subtitle">Size</AppText>
            <View style={styles.chipRow}>
              {status?.standard.sizes.length ? (
                status.standard.sizes.map((size) => {
                  const selected = selectedSize === size;
                  return (
                    <Pressable
                      key={size}
                      onPress={() => setSelectedSize(size)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                        },
                      ]}
                    >
                      <AppText variant="caption" tone={selected ? 'inverse' : 'default'}>
                        {size}
                      </AppText>
                    </Pressable>
                  );
                })
              ) : (
                <AppText variant="caption" tone="danger">No size options are available.</AppText>
              )}
            </View>
          </View>
        ) : null}

        {requiresColor ? (
          <View style={styles.section}>
            <AppText variant="subtitle">Color</AppText>
            <View style={styles.chipRow}>
              {status?.standard.colors.length ? (
                status.standard.colors.map((color) => {
                  const selected = selectedColor === color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setSelectedColor(color)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                        },
                      ]}
                    >
                      <AppText variant="caption" tone={selected ? 'inverse' : 'default'}>
                        {color}
                      </AppText>
                    </Pressable>
                  );
                })
              ) : (
                <AppText variant="caption" tone="danger">No color options are available.</AppText>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="subtitle">Quantity</AppText>
          <View style={styles.quantityRow}>
            <Button title="-" size="sm" variant="secondary" onPress={() => setQuantity((current) => Math.max(1, current - 1))} />
            <AppText variant="bodyBold">{quantity}</AppText>
            <Button title="+" size="sm" variant="secondary" onPress={() => setQuantity((current) => Math.min(10, current + 1))} />
          </View>
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  chip: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderWidth: 1,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
});
