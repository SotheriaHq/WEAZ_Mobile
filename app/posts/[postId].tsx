import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { apiClient } from '@/src/api/httpClient';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type PostComment = {
  id: string;
  text: string;
  createdAt: string;
  user?: {
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    brandFullName?: string | null;
  } | null;
};

function displayName(user?: PostComment['user']) {
  if (!user) return 'User';
  const brandName = typeof user.brandFullName === 'string' ? user.brandFullName.trim() : '';
  if (brandName) return brandName;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return typeof user.username === 'string' && user.username.trim() ? user.username : 'User';
}

function normalizeComment(raw: any): PostComment {
  return {
    id: typeof raw?.id === 'string' ? raw.id : `${Date.now()}`,
    text:
      typeof raw?.contentSanitized === 'string'
        ? raw.contentSanitized
        : typeof raw?.contentRaw === 'string'
          ? raw.contentRaw
          : typeof raw?.text === 'string'
            ? raw.text
            : '',
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    user: raw?.user ?? raw?.author ?? null,
  };
}

export default function PostDetailRoute() {
  const params = useLocalSearchParams<{ postId?: string | string[]; commentId?: string | string[] }>();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId ?? '';
  const commentId = Array.isArray(params.commentId) ? params.commentId[0] : params.commentId ?? null;

  const { theme } = useTheme();
  const commentListRef = useRef<FlatList<PostComment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<any | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!postId) {
        if (mounted) {
          setError('Missing post id.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [postResponse, commentsResponse] = await Promise.all([
          apiClient.get(`/api/v1/posts/${postId}`),
          apiClient.get(`/api/v1/posts/${postId}/comments`),
        ]);

        const postPayload = (postResponse.data?.data ?? postResponse.data ?? null) as any;
        const commentsPayload = (commentsResponse.data?.data ?? commentsResponse.data ?? {}) as { items?: any[] } | any[];
        const commentItems = Array.isArray(commentsPayload) ? commentsPayload : Array.isArray(commentsPayload?.items) ? commentsPayload.items : [];

        if (!mounted) return;

        setPost(postPayload);
        setComments(commentItems.map(normalizeComment));
      } catch (nextError) {
        if (!mounted) return;
        setError('Unable to load this post right now.');
        setPost(null);
        setComments([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [postId]);

  useEffect(() => {
    if (!commentId || comments.length === 0) return;
    const targetIndex = comments.findIndex((comment) => comment.id === commentId);
    if (targetIndex < 0) return;

    const timer = setTimeout(() => {
      commentListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.15 });
    }, 0);

    return () => clearTimeout(timer);
  }, [commentId, comments]);

  const heroImage = useResolvedImageUri({
    src: post?.images?.[0]?.file?.previewUrl ?? post?.images?.[0]?.file?.url ?? post?.images?.[0]?.url ?? undefined,
    fileId: post?.images?.[0]?.file?.id ?? undefined,
  });

  const postContent = typeof post?.content === 'string' ? post.content.trim() : '';

  if (loading) {
    return <AppLoaderScreen message="Loading post" />;
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={["top"]}>
        <View style={styles.header}>
          <AppBackButton fallbackHref="/(tabs)" />
          <AppText variant="title">Post</AppText>
        </View>
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">📄</AppText>
          <AppText variant="bodyBold">Could not load post</AppText>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Button title="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/(tabs)" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Post</AppText>
          <AppText variant="captionRegular" tone="muted">
            Comment thread and post context.
          </AppText>
        </View>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            {heroImage ? (
              <StableImage uri={heroImage} containerStyle={styles.heroImage} imageStyle={styles.heroImage} />
            ) : (
              <View style={[styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="display">📝</AppText>
              </View>
            )}

            <Card padding="lg" style={[styles.postCard, { borderColor: theme.colors.border }]}>
              <AppText variant="title">{post?.title ?? 'Untitled post'}</AppText>
              {postContent ? <AppText variant="body" tone="muted">{postContent}</AppText> : null}
            </Card>

            <View style={styles.commentsHeader}>
              <AppText variant="bodyBold">Comments</AppText>
              <View style={[styles.commentsHeaderLine, { backgroundColor: theme.colors.border }]} />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const name = displayName(item.user);
          const time = (() => {
            const date = new Date(item.createdAt).getTime();
            const delta = Math.max(0, Date.now() - date);
            if (delta < 60_000) return 'just now';
            if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
            if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
            return `${Math.floor(delta / 86_400_000)}d`;
          })();

          const isTarget = commentId === item.id;
          return (
            <View style={[styles.commentCard, isTarget && { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={styles.commentTopRow}>
                <View style={[styles.commentAvatar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                  <AppText variant="captionBold">{name.slice(0, 1).toUpperCase()}</AppText>
                </View>
                <View style={styles.commentCopy}>
                  <View style={styles.commentMetaRow}>
                    <AppText variant="bodyBold">{name}</AppText>
                    <AppText variant="captionRegular" tone="muted">{time}</AppText>
                  </View>
                  <AppText variant="body">{item.text}</AppText>
                </View>
              </View>
            </View>
          );
        }}
        onScrollToIndexFailed={({ index }) => {
          if (index < 0 || index >= comments.length) return;
          requestAnimationFrame(() => {
            commentListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.15 });
          });
        }}
        ref={commentListRef}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <AppText variant="subtitle">💬</AppText>
            <AppText variant="bodyBold">No comments yet</AppText>
            <AppText variant="body" tone="muted">Be the first to react to this post.</AppText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  headerStack: {
    gap: tokens.spacing.md,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: tokens.radius.xl,
  },
  heroFallback: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postCard: {
    gap: tokens.spacing.sm,
    borderWidth: 1,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  commentsHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  commentCard: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  commentTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  commentCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xl,
  },
});
