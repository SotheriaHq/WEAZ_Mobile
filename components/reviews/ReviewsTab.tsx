import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import DeleteReviewConfirmSheet from '@/components/reviews/DeleteReviewConfirmSheet';
import ReviewCard from '@/components/reviews/ReviewCard';
import ReviewFormSheet from '@/components/reviews/ReviewFormSheet';
import ReviewSummary from '@/components/reviews/ReviewSummary';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { ReviewDto, ReviewListDto, ReviewSummaryDto, UpdateReviewPayload } from '@/src/api/ReviewApi';
import reviewApi from '@/src/api/ReviewApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const emptySummary: ReviewSummaryDto = {
  averageRating: 0,
  reviewCount: 0,
  ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  satisfactionDistribution: {
    NONE: 0,
    ANGRY: 0,
    SAD: 0,
    OKAY: 0,
    HAPPY: 0,
    EXCITED: 0,
  },
};

type Props = {
  brandId?: string | null;
  productId?: string | null;
  compact?: boolean;
};

export default function ReviewsTab({ brandId, productId, compact = false }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [items, setItems] = useState<ReviewDto[]>([]);
  const [summary, setSummary] = useState<ReviewSummaryDto>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewDto | null>(null);
  const [deleteReview, setDeleteReview] = useState<ReviewDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const applyList = useCallback((response: ReviewListDto) => {
    setItems(response.items);
    setSummary(response.summary);
  }, []);

  const load = useCallback(async () => {
    if (!brandId && !productId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setFeatureDisabled(false);
    try {
      const response = productId
        ? await reviewApi.getProductReviews(productId, { limit: compact ? 3 : 20 }, currentUserId)
        : await reviewApi.getBrandReviews(brandId as string, { limit: 20 }, currentUserId);
      applyList(response);
    } catch (nextError) {
      const status = (nextError as { status?: number })?.status;
      if (status === 403) {
        setFeatureDisabled(true);
        setItems([]);
        setSummary(emptySummary);
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load reviews.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyList, brandId, compact, currentUserId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );

  const handleEdit = async (payload: UpdateReviewPayload) => {
    if (!editingReview) return;
    const updated = await reviewApi.updateReview(editingReview.id, payload);
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingReview(null);
    toast.success('Review updated');
  };

  const handleDelete = async () => {
    if (!deleteReview) return;
    setDeleting(true);
    try {
      await reviewApi.deleteReview(deleteReview.id);
      setItems((current) => current.filter((item) => item.id !== deleteReview.id));
      setSummary((current) => ({ ...current, reviewCount: Math.max(0, current.reviewCount - 1) }));
      toast.success('Review deleted');
      setDeleteReview(null);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to delete review');
    } finally {
      setDeleting(false);
    }
  };

  if (featureDisabled) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.loading, compact ? styles.compactWrap : styles.wrap]}>
        <ActivityIndicator color={theme.colors.primary} />
        <AppText variant="body" tone="muted">Loading reviews...</AppText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.empty, compact ? styles.compactWrap : styles.wrap]}>
        <AppText variant="subtitle">Reviews are unavailable</AppText>
        <AppText variant="body" tone="muted" style={styles.centerText}>{error}</AppText>
        <Button title="Retry" onPress={() => void load()} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact ? styles.compactWrap : null]}>
      <ReviewSummary summary={summary} />

      {sortedItems.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="subtitle">No verified reviews yet.</AppText>
          <AppText variant="body" tone="muted" style={styles.centerText}>
            Buyer feedback will appear here after completed orders are reviewed.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {sortedItems.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={currentUserId}
              onEdit={setEditingReview}
              onDelete={setDeleteReview}
            />
          ))}
        </View>
      )}

      <ReviewFormSheet
        visible={Boolean(editingReview)}
        mode="edit"
        review={editingReview}
        onClose={() => setEditingReview(null)}
        onSubmit={(payload) => handleEdit(payload as UpdateReviewPayload)}
      />
      <DeleteReviewConfirmSheet
        visible={Boolean(deleteReview)}
        loading={deleting}
        onCancel={() => setDeleteReview(null)}
        onConfirm={handleDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: 80,
    gap: tokens.spacing.md,
  },
  compactWrap: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  list: {
    gap: tokens.spacing.md,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  empty: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
});
