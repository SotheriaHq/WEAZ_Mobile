import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import DeleteReviewConfirmSheet from '@/components/reviews/DeleteReviewConfirmSheet';
import ReviewCard from '@/components/reviews/ReviewCard';
import ReviewFormSheet from '@/components/reviews/ReviewFormSheet';
import { targetLabel } from '@/components/reviews/reviewDisplay';
import reviewApi, { type ReviewDto, type ReviewTargetType, type UpdateReviewPayload } from '@/src/api/ReviewApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type ReviewFilter = 'ALL' | 'EDITABLE' | 'EXPIRED' | ReviewTargetType;

const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'EDITABLE', label: 'Editable' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'PRODUCT', label: 'Products' },
  { key: 'BRAND', label: 'Brands' },
  { key: 'COLLECTION', label: 'Collections' },
  { key: 'DESIGN', label: 'Designs' },
  { key: 'CUSTOM_ORDER', label: 'Custom' },
];

function targetName(review: ReviewDto) {
  return (
    review.target?.name ||
    review.productId ||
    review.collectionId ||
    review.legacyCollectionId ||
    review.designId ||
    review.customOrderId ||
    review.brandId ||
    'Verified purchase'
  );
}

function MyReviewRow({
  review,
  currentUserId,
  onEdit,
  onDelete,
}: {
  review: ReviewDto;
  currentUserId: string | null;
  onEdit: (review: ReviewDto) => void;
  onDelete: (review: ReviewDto) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.reviewWrap}>
      <View style={[styles.contextRow, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
        <View style={styles.contextCopy}>
          <AppText variant="captionBold" tone="muted">
            {targetLabel(review.targetType).toUpperCase()}
          </AppText>
          <AppText variant="bodyBold" numberOfLines={1}>
            {targetName(review)}
          </AppText>
        </View>
        <View style={[styles.windowPill, { backgroundColor: review.canEdit ? theme.colors.primarySoft : theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone={review.canEdit ? 'primary' : 'muted'}>
            {review.canEdit ? 'Editable' : 'Edit expired'}
          </AppText>
        </View>
      </View>
      <ReviewCard review={review} currentUserId={currentUserId} onEdit={onEdit} onDelete={onDelete} />
    </View>
  );
}

export default function MyReviewsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReview, setEditingReview] = useState<ReviewDto | null>(null);
  const [deleteReview, setDeleteReview] = useState<ReviewDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace({ pathname: '/(auth)/login', params: { next: '/reviews' } } as any);
    }
  }, [status]);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await reviewApi.getMyReviews({ limit: 50 }, currentUserId);
      setReviews(response.items);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your reviews.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void load();
  }, [load, status]);

  const filteredReviews = useMemo(() => {
    const sorted = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (filter === 'ALL') return sorted;
    if (filter === 'EDITABLE') return sorted.filter((review) => review.canEdit);
    if (filter === 'EXPIRED') return sorted.filter((review) => !review.canEdit && review.status !== 'DELETED');
    return sorted.filter((review) => review.targetType === filter);
  }, [filter, reviews]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true });
  }, [load]);

  const handleEdit = async (payload: UpdateReviewPayload) => {
    if (!editingReview) return;
    const updated = await reviewApi.updateReview(editingReview.id, payload);
    setReviews((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingReview(null);
    toast.success('Review updated');
  };

  const handleDelete = async () => {
    if (!deleteReview) return;
    setDeleting(true);
    try {
      await reviewApi.deleteReview(deleteReview.id);
      setReviews((current) => current.filter((item) => item.id !== deleteReview.id));
      toast.success('Review deleted');
      setDeleteReview(null);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to delete review');
    } finally {
      setDeleting(false);
    }
  };

  const content = (() => {
    if (status === 'loading' || loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">Loading your reviews...</AppText>
        </View>
      );
    }

    if (error) {
      return (
        <Card padding="lg" style={styles.stateCard}>
          <AppText variant="subtitle">Reviews are unavailable</AppText>
          <AppText variant="body" tone="muted" style={styles.centerText}>{error}</AppText>
          <Button title="Retry" onPress={() => void load()} fullWidth />
        </Card>
      );
    }

    if (filteredReviews.length === 0) {
      return (
        <Card padding="lg" style={styles.stateCard}>
          <AppText variant="subtitle">No reviews match this view.</AppText>
          <AppText variant="body" tone="muted" style={styles.centerText}>
            Completed-order reviews you submit will appear here.
          </AppText>
          <Button title="View orders" variant="secondary" onPress={() => router.push('/orders' as any)} fullWidth />
        </Card>
      );
    }

    return (
      <FlatList
        data={filteredReviews}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MyReviewRow
            review={item}
            currentUserId={currentUserId}
            onEdit={setEditingReview}
            onDelete={setDeleteReview}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, tokens.spacing.lg) + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      />
    );
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)/me" />
        <View style={styles.headerCopy}>
          <AppText variant="title">My Reviews</AppText>
          <AppText variant="captionRegular" tone="muted">
            Edit is limited to the original 24-hour window. Delete stays available anytime.
          </AppText>
        </View>
      </View>

      <View style={[styles.filterRail, { borderBottomColor: theme.colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => {
            const selected = filter === item.key;
            return (
              <Pressable
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="captionBold" tone={selected ? 'inverse' : 'secondary'}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          }}
        />
      </View>

      {content}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  filterRail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterContent: {
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  listContent: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  reviewWrap: {
    gap: tokens.spacing.sm,
  },
  contextRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  contextCopy: {
    flex: 1,
    minWidth: 0,
  },
  windowPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 2,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  stateCard: {
    margin: tokens.spacing.lg,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
