import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { brandApi, type ReviewDto } from '@/src/api/BrandApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

function starString(rating: number, max = 5): string {
  const filled = Math.round(Math.max(0, Math.min(max, rating)));
  return '*'.repeat(filled) + '-'.repeat(max - filled);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getInitials(user: ReviewDto['user']): string {
  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (user.username) return user.username.slice(0, 2).toUpperCase();
  return '??';
}

function RatingBar({ label, value, total }: { label: string; value: number; total: number }) {
  const { theme } = useTheme();
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <View style={styles.ratingBarRow}>
      <AppText variant="caption" tone="muted" style={styles.ratingBarLabel}>
        {label}
      </AppText>
      <View style={[styles.ratingBarTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.ratingBarFill, { backgroundColor: theme.colors.primary, width: `${pct}%` as any }]} />
      </View>
      <AppText variant="caption" tone="muted" style={styles.ratingBarCount}>
        {value}
      </AppText>
    </View>
  );
}

function ReviewCard({ review }: { review: ReviewDto }) {
  const { theme } = useTheme();
  const initials = getInitials(review.user);

  return (
    <View style={[styles.reviewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.reviewUserRow}>
        <View style={[styles.reviewAvatar, { backgroundColor: theme.colors.primarySoft }]}>
          {review.user.profileImage ? (
            <Image source={{ uri: review.user.profileImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <AppText variant="captionBold" tone="primary">
              {initials}
            </AppText>
          )}
        </View>

        <View style={styles.reviewIdentity}>
          <View style={styles.reviewNameRow}>
            <AppText variant="captionBold" numberOfLines={1}>
              {review.user.firstName && review.user.lastName
                ? `${review.user.firstName} ${review.user.lastName}`
                : review.user.username ?? 'Customer'}
            </AppText>
            {review.isVerifiedPurchase ? (
              <AppText variant="caption" tone="success">
                Verified
              </AppText>
            ) : null}
          </View>
          <AppText variant="caption" tone="muted">
            {formatDate(review.createdAt)}
          </AppText>
        </View>

        <AppText variant="caption" tone="warning" style={styles.reviewStars}>
          {starString(review.rating)}
        </AppText>
      </View>

      {review.comment ? (
        <AppText variant="body" tone="secondary" style={styles.reviewComment}>
          {review.comment}
        </AppText>
      ) : null}
    </View>
  );
}

function ReviewsSummary({
  averageRating,
  totalCount,
  distribution,
}: {
  averageRating: number;
  totalCount: number;
  distribution: Record<string, number>;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.summaryLeft}>
        <AppText variant="display">{averageRating.toFixed(1)}</AppText>
        <AppText variant="caption" tone="warning" style={styles.avgStars}>
          {starString(Math.round(averageRating))}
        </AppText>
        <AppText variant="caption" tone="muted">
          {totalCount} review{totalCount !== 1 ? 's' : ''}
        </AppText>
      </View>

      <View style={styles.summaryRight}>
        {[5, 4, 3, 2, 1].map((n) => (
          <RatingBar key={n} label={`${n}*`} value={distribution[String(n)] ?? 0} total={totalCount} />
        ))}
      </View>
    </View>
  );
}

function ReviewsSkeleton() {
  const { theme } = useTheme();
  const pulse = { backgroundColor: theme.colors.surfaceAlt, borderRadius: tokens.radius.sm };

  return (
    <View style={styles.skeletonRoot}>
      {[1, 2, 3, 4].map((item) => (
        <View key={item} style={[styles.reviewCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.skeletonRow}>
            <View style={[pulse, styles.skeletonAvatar]} />
            <View style={styles.skeletonTextStack}>
              <View style={[pulse, styles.skeletonLineWide]} />
              <View style={[pulse, styles.skeletonLineShort]} />
            </View>
          </View>
          <View style={[pulse, styles.skeletonBodyLine]} />
        </View>
      ))}
    </View>
  );
}

function ReviewsEmpty() {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display" tone="muted">
        *
      </AppText>
      <AppText variant="subtitle" style={styles.emptyTitle}>
        No Reviews Yet
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>
        Be the first to leave a review after purchasing from this brand.
      </AppText>
    </View>
  );
}

function ReviewsError({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyState}>
      <AppText variant="display" tone="muted">
        !
      </AppText>
      <AppText variant="subtitle" style={styles.emptyTitle}>
        Reviews are unavailable
      </AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>
        We could not load reviews right now. Please try again.
      </AppText>
      <AppText
        variant="bodyBold"
        tone="inverse"
        onPress={onRetry}
        style={[styles.retryText, { backgroundColor: theme.colors.primary }]}
      >
        Retry
      </AppText>
    </View>
  );
}

interface BrandReviewsTabProps {
  brandId?: string;
}

export function BrandReviewsTab({ brandId }: BrandReviewsTabProps) {
  const { theme } = useTheme();
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const distribution = reviews.reduce<Record<string, number>>((acc, review) => {
    const key = String(Math.round(review.rating));
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const fetchReviews = useCallback(async () => {
    try {
      setError(false);
      const result = await brandApi.getReviews(brandId);
      setReviews(result.items);
      setAverageRating(result.averageRating);
      setTotalCount(result.totalCount);
    } catch {
      setReviews([]);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [brandId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchReviews();
  }, [fetchReviews]);

  if (loading) {
    return <ReviewsSkeleton />;
  }

  if (error) {
    return <ReviewsError onRetry={handleRefresh} />;
  }

  if (reviews.length === 0) {
    return <ReviewsEmpty />;
  }

  return (
    <FlatList
      data={reviews}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        totalCount > 0 ? (
          <ReviewsSummary averageRating={averageRating} totalCount={totalCount} distribution={distribution} />
        ) : null
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <ReviewCard review={item} />}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: 80,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  summaryCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    flexDirection: 'row',
    gap: tokens.spacing.lg,
  },
  summaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  avgStars: {
    marginTop: tokens.spacing.xs,
  },
  summaryRight: {
    flex: 1,
    gap: tokens.spacing.sm,
    justifyContent: 'center',
  },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  ratingBarLabel: {
    width: 28,
  },
  ratingBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  ratingBarCount: {
    width: 20,
    textAlign: 'right',
  },
  reviewCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
  },
  reviewUserRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  reviewIdentity: {
    flex: 1,
    minWidth: 0,
  },
  reviewNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  reviewStars: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  reviewComment: {
    marginTop: tokens.spacing.md,
  },
  separator: {
    height: tokens.spacing.sm,
  },
  skeletonRoot: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'flex-start',
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
  },
  skeletonTextStack: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  skeletonLineWide: {
    width: 140,
    height: 14,
  },
  skeletonLineShort: {
    width: 86,
    height: 12,
  },
  skeletonBodyLine: {
    width: '92%',
    height: 12,
    marginTop: tokens.spacing.md,
  },
  emptyState: {
    paddingHorizontal: tokens.spacing['2xl'],
    paddingVertical: 56,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: tokens.spacing.md,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: tokens.spacing.sm,
  },
  retryText: {
    marginTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
});

export default BrandReviewsTab;
