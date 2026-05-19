import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MobileStoreApi, type ProductBagStatus, type StoreProductVariant } from '@/src/api/StoreApi';
import { useToast } from '@/src/toast/ToastContext';
import { useAuth } from '@/src/auth/AuthContext';
import { ProfileApi, type AutoSizeRecommendationMode, type SizeRecommendationResponse } from '@/src/api/ProfileApi';
import {
  buildSizeRecommendationSnapshot,
  canUseRecommendedSize,
  CONFIDENCE_LABELS,
  SIZING_REGION_LABELS,
} from '@/src/utils/sizeRecommendation';

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
  const toast = useToast();
  const { status: authStatus } = useAuth();
  const { addStandard, loadingByProductId } = useMobileBagging();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [variants, setVariants] = useState<StoreProductVariant[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState<AutoSizeRecommendationMode | null>(null);
  const [recommendation, setRecommendation] = useState<SizeRecommendationResponse | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [sizeSelectionTouched, setSizeSelectionTouched] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedSize(status?.standard.selectedSize ?? null);
    setSelectedColor(status?.standard.selectedColor ?? null);
    setQuantity(1);
    setSelectionError(null);
    setRecommendation(null);
    setRecommendationError(null);
    setAutoMode(null);
    setSizeSelectionTouched(false);
    setWhyOpen(false);
  }, [status, visible]);

  useEffect(() => {
    if (!visible || !product) {
      setVariants([]);
      return;
    }

    let active = true;
    void MobileStoreApi.getProductById(product.id)
      .then((detail) => {
        if (active) setVariants(Array.isArray(detail.variants) ? detail.variants : []);
      })
      .catch(() => {
        if (active) setVariants([]);
      });

    return () => {
      active = false;
    };
  }, [product, visible]);

  useEffect(() => {
    if (!visible || !product || authStatus !== 'authenticated') {
      setAutoMode(null);
      setRecommendation(null);
      setRecommendationError(null);
      setRecommendationLoading(false);
      return;
    }
    let active = true;
    setRecommendationLoading(true);
    setRecommendationError(null);

    void Promise.all([
      ProfileApi.getSizeFit().catch(() => null),
      MobileStoreApi.getProductSizeRecommendation(product.id).catch((error) => {
        const statusCode = Number(error?.response?.status);
        if (statusCode === 404 || statusCode === 422) return null;
        throw error;
      }),
    ])
      .then(([profile, nextRecommendation]) => {
        if (!active) return;
        setAutoMode(profile?.autoSizeRecommendation ?? null);
        setRecommendation(nextRecommendation);
      })
      .catch(() => {
        if (active) setRecommendationError('Size recommendation is temporarily unavailable.');
      })
      .finally(() => {
        if (active) setRecommendationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authStatus, product, visible]);

  const isLoading = Boolean(product && loadingByProductId[product.id]);
  const requiresSize = Boolean(status?.standard.requiresSize);
  const requiresColor = Boolean(status?.standard.requiresColor);

  const hasVariantMatrix = variants.length > 0;
  const sizeOptions = status?.standard.sizes ?? [];

  const variantIsAvailable = (variant: StoreProductVariant, size: string | null, color: string | null) => {
    if (Number(variant.stock ?? 0) <= 0) return false;
    if (size && variant.size && variant.size !== size) return false;
    if (color && variant.color && variant.color !== color) return false;
    return true;
  };

  const sizeIsDisabled = (size: string) =>
    hasVariantMatrix && !variants.some((variant) => variantIsAvailable(variant, size, selectedColor));

  const colorIsDisabled = (color: string) =>
    hasVariantMatrix && !variants.some((variant) => variantIsAvailable(variant, selectedSize, color));

  const selectedVariantValid = useMemo(() => {
    if (!hasVariantMatrix) return true;
    return variants.some((variant) => variantIsAvailable(variant, selectedSize, selectedColor));
  }, [hasVariantMatrix, selectedColor, selectedSize, variants]);

  useEffect(() => {
    if (autoMode !== 'ON') return;
    if (sizeSelectionTouched) return;
    if (!canUseRecommendedSize(recommendation, sizeOptions)) return;
    if (!recommendation?.recommendedSize) return;
    setSelectedSize(recommendation.recommendedSize);
  }, [autoMode, recommendation, sizeOptions, sizeSelectionTouched]);

  const canSubmit = useMemo(() => {
    if (!product || !status) return false;
    if (requiresSize && !selectedSize) return false;
    if (requiresColor && !selectedColor) return false;
    if (!selectedVariantValid) return false;
    return !isLoading;
  }, [isLoading, product, requiresColor, requiresSize, selectedColor, selectedSize, selectedVariantValid, status]);

  const handleSubmit = async () => {
    if (!product || !status) return;
    if (requiresSize && !selectedSize) {
      setSelectionError('Select a size to continue.');
      return;
    }
    if (requiresColor && !selectedColor) {
      setSelectionError('Select a color to continue.');
      return;
    }
    if (!selectedVariantValid) {
      setSelectionError('This size and color combination is unavailable.');
      return;
    }

    try {
      await addStandard({
        productId: product.id,
        qty: quantity,
        size: selectedSize ?? undefined,
        color: selectedColor ?? undefined,
        sizeRecommendationSnapshot: buildSizeRecommendationSnapshot(recommendation, selectedSize),
      });
      toast.success('Added to your bag');
      onClose();
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Unable to add this item with the selected options.';
      setSelectionError(message);
      toast.error(message);
    }
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
        <View
          style={[
            styles.recommendationCard,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <AppText variant="caption" tone="muted">Recommended for you</AppText>
          {recommendationLoading ? (
            <AppText variant="body">Checking saved measurements...</AppText>
          ) : recommendation?.recommendedSize ? (
            <>
              <View style={styles.recommendationHeader}>
                <AppText variant="title">{recommendation.recommendedSize}</AppText>
                <AppText variant="caption" tone="muted">
                  {CONFIDENCE_LABELS[recommendation.confidenceLabel]}
                </AppText>
              </View>
              {recommendation.alternativeSize ? (
                <AppText variant="caption" tone="muted">Alternative: {recommendation.alternativeSize}</AppText>
              ) : null}
              {selectedSize && selectedSize !== recommendation.recommendedSize ? (
                <AppText variant="caption" tone="warning">
                  Your saved measurements suggest {recommendation.recommendedSize}, but you selected {selectedSize}.
                </AppText>
              ) : null}
              {recommendation.fallbackUsed ? (
                <AppText variant="caption" tone="muted">
                  This uses the best available fallback chart because this product does not have a more specific approved chart yet.
                </AppText>
              ) : null}
              {recommendation.selectedRegion === 'NG_WEST_AFRICA' ? (
                <AppText variant="caption" tone="muted">
                  Nigeria/West Africa support uses approved product, brand, regional, or mapped chart data where available.
                </AppText>
              ) : null}
              <View style={styles.recommendationActions}>
                {autoMode !== 'ON' && canUseRecommendedSize(recommendation, sizeOptions) ? (
                  <Button
                    title={`Use ${recommendation.recommendedSize}`}
                    size="sm"
                    onPress={() => {
                      setSelectedSize(recommendation.recommendedSize);
                      setSizeSelectionTouched(true);
                    }}
                  />
                ) : null}
                <Button
                  title="Why this size?"
                  size="sm"
                  variant="secondary"
                  onPress={() => setWhyOpen((current) => !current)}
                />
              </View>
              {whyOpen ? (
                <View style={styles.whyBox}>
                  <AppText variant="caption" tone="muted">
                    Region: {SIZING_REGION_LABELS[recommendation.selectedRegion]}
                  </AppText>
                  {(recommendation.reasons.length ? recommendation.reasons : ['Threadly compared your saved measurements with approved chart ranges.']).map((reason) => (
                    <AppText key={reason} variant="caption">- {reason}</AppText>
                  ))}
                  <AppText variant="caption" tone="muted">
                    Size charts are guides. Fit may vary by brand, fabric, and cut.
                  </AppText>
                </View>
              ) : null}
            </>
          ) : (
            <AppText variant="caption" tone={recommendationError ? 'warning' : 'muted'}>
              {recommendationError || 'Add your measurements to get size recommendations.'}
            </AppText>
          )}
        </View>

        {requiresSize ? (
          <View style={styles.section}>
            <AppText variant="subtitle">Size</AppText>
            <View style={styles.chipRow}>
              {status?.standard.sizes.length ? (
                status.standard.sizes.map((size) => {
                  const selected = selectedSize === size;
                  const disabled = sizeIsDisabled(size);
                  return (
                    <Pressable
                      key={size}
                      disabled={disabled}
                      onPress={() => {
                        setSelectionError(null);
                        setSelectedSize(size);
                        setSizeSelectionTouched(true);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                          opacity: disabled ? 0.4 : 1,
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
                  const disabled = colorIsDisabled(color);
                  return (
                    <Pressable
                      key={color}
                      disabled={disabled}
                      onPress={() => {
                        setSelectionError(null);
                        setSelectedColor(color);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                          opacity: disabled ? 0.4 : 1,
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

        {selectionError ? (
          <AppText variant="caption" tone="danger">{selectionError}</AppText>
        ) : !selectedVariantValid ? (
          <AppText variant="caption" tone="danger">This size and color combination is unavailable.</AppText>
        ) : null}
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
  recommendationCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  recommendationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  whyBox: {
    gap: tokens.spacing.xs,
  },
});
