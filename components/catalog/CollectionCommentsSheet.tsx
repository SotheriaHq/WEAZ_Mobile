import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiClient } from '@/src/api/httpClient';
import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';

type Comment = {
  id: string;
  text: string;
  createdAt: string;
  author?: { username?: string; displayName?: string };
};

type BackendCommentUser = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  brandFullName?: string | null;
};

type BackendComment = {
  id?: string;
  contentSanitized?: string | null;
  contentRaw?: string | null;
  text?: string | null;
  createdAt?: string;
  user?: BackendCommentUser | null;
  author?: BackendCommentUser | null;
};

type CollectionCommentsSheetProps = {
  visible: boolean;
  collectionId: string | null;
  collectionTitle?: string | null;
  initialCommentId?: string | null;
  onClose: () => void;
};
const normalizeDisplayName = (user?: BackendCommentUser | null) => {
  if (!user) return 'User';

  const brandName = typeof user.brandFullName === 'string' ? user.brandFullName.trim() : '';
  if (brandName) return brandName;

  const fullName = [user.firstName, user.lastName]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName) return fullName;

  const username = typeof user.username === 'string' ? user.username.trim() : '';
  return username || 'User';
};

const normalizeComment = (raw: BackendComment): Comment => {
  const author = raw.user ?? raw.author ?? null;
  const fallbackText = typeof raw.text === 'string' ? raw.text : '';
  const contentText = typeof raw.contentSanitized === 'string'
    ? raw.contentSanitized
    : typeof raw.contentRaw === 'string'
      ? raw.contentRaw
      : fallbackText;

  return {
    id: typeof raw.id === 'string' ? raw.id : `${Date.now()}`,
    text: contentText,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    author: author
      ? {
          username: typeof author.username === 'string' ? author.username : undefined,
          displayName: normalizeDisplayName(author),
        }
      : undefined,
  };
};

const commentsApi = {
  list: async (collectionId: string): Promise<Comment[]> => {
    try {
      const res = await apiClient.get(`/api/v1/collections/${collectionId}/comments-unified`);
      const payload = (res.data?.data ?? res.data ?? {}) as { items?: BackendComment[] } | BackendComment[];
      const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
      return items.map(normalizeComment);
    } catch {
      return [];
    }
  },
  post: async (collectionId: string, text: string): Promise<Comment | null> => {
    try {
      const res = await apiClient.post(`/api/v1/collections/${collectionId}/comments`, { content: text, text });
      const payload = (res.data?.data ?? res.data ?? null) as BackendComment | null;
      return payload ? normalizeComment(payload) : null;
    } catch {
      return null;
    }
  },
};

function CommentItem({
  comment,
  colors,
  highlighted,
}: {
  comment: Comment;
  colors: {
    surfaceAlt: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
  };
  highlighted?: boolean;
}) {
  const authorName = comment.author?.displayName || comment.author?.username || 'User';
  const time = (() => {
    try {
      const d = new Date(comment.createdAt);
      const diff = Date.now() - d.getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
      return `${Math.floor(diff / 86400000)}d`;
    } catch {
      return '';
    }
  })();

  return (
    <View
      style={[
        styles.commentItem,
        highlighted
          ? {
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderRadius: 16,
              padding: 10,
            }
          : null,
      ]}
    >
      <View
        style={[
          styles.commentAvatar,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <AppText style={styles.commentAvatarText}>{authorName.slice(0, 1).toUpperCase()}</AppText>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <AppText style={[styles.commentAuthor, { color: colors.text }]}>{authorName}</AppText>
          {time ? (
            <AppText style={[styles.commentTime, { color: colors.textMuted }]}> 
              {time}
            </AppText>
          ) : null}
        </View>
        <AppText style={[styles.commentText, { color: colors.textSecondary }]}> 
          {comment.text}
        </AppText>
      </View>
    </View>
  );
}

export default function CollectionCommentsSheet({
  visible,
  collectionId,
  collectionTitle,
  initialCommentId = null,
  onClose,
}: CollectionCommentsSheetProps) {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const translateY = useRef(new Animated.Value(480)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const commentsListRef = useRef<FlatList<Comment> | null>(null);

  const loadComments = useMemo(
    () => async (targetCollectionId: string) => {
      setCommentsLoading(true);
      const items = await commentsApi.list(targetCollectionId);
      setComments(items);
      setCommentsLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (!visible || !collectionId) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 480,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
        setCommentText('');
      });
      return;
    }

    setMounted(true);
    void loadComments(collectionId);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
      }),
    ]).start();
  }, [collectionId, loadComments, opacity, translateY, visible]);

  useEffect(() => {
    if (!initialCommentId || comments.length === 0) return;
    const targetIndex = comments.findIndex((comment) => comment.id === initialCommentId);
    if (targetIndex < 0) return;

    const timer = window.setTimeout(() => {
      commentsListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.15 });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [comments, initialCommentId]);

  const sendComment = useMemo(
    () => async () => {
      const targetCollectionId = collectionId?.trim();
      const text = commentText.trim();
      if (!targetCollectionId || !text || sendingComment) return;

      setSendingComment(true);
      const newComment = await commentsApi.post(targetCollectionId, text);
      if (newComment) {
        setComments((prev) => [newComment, ...prev]);
        setCommentText('');
      }
      setSendingComment(false);
    },
    [collectionId, commentText, sendingComment],
  );

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}>
          <Pressable style={styles.scrim} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? '#0f0b18' : '#ffffff',
              borderTopColor: theme.colors.border,
              paddingBottom: insets.bottom,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.panelHandle}>
            <Pressable onPress={onClose} style={styles.panelHandleBar}>
              <View
                style={[
                  styles.panelHandleBarInner,
                  { backgroundColor: theme.colors.textMuted },
                ]}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.panelHeader,
              { borderBottomColor: theme.colors.border },
            ]}
          >
            <View style={styles.panelHeaderText}>
              <AppText style={[styles.panelTitle, { color: theme.colors.text }]}>Comments</AppText>
              {collectionTitle ? (
                <AppText style={[styles.panelSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {collectionTitle}
                </AppText>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <AppText style={[styles.panelClose, { color: theme.colors.textSecondary }]}> 
                ×
              </AppText>
            </Pressable>
          </View>

          {commentsLoading ? (
            <View style={styles.commentsLoading}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={commentsListRef}
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CommentItem
                  comment={item}
                  highlighted={initialCommentId === item.id}
                  colors={{
                    surfaceAlt: theme.colors.surfaceAlt,
                    border: theme.colors.border,
                    text: theme.colors.text,
                    textSecondary: theme.colors.textSecondary,
                    textMuted: theme.colors.textMuted,
                  }}
                />
              )}
              contentContainerStyle={styles.commentsList}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={({ index }) => {
                if (index < 0 || index >= comments.length) return;
                requestAnimationFrame(() => {
                  commentsListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.15 });
                });
              }}
              ListEmptyComponent={
                <View style={styles.commentsEmpty}>
                  <AppText style={styles.commentsEmptyEmoji}>💬</AppText>
                  <AppText style={[styles.commentsEmptyText, { color: theme.colors.textMuted }]}> 
                    No comments yet. Be the first.
                  </AppText>
                </View>
              }
            />
          )}

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View
              style={[
                styles.commentInput,
                {
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment..."
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.commentInputField,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                returnKeyType="send"
                onSubmitEditing={() => {
                  void sendComment();
                }}
              />
              <Pressable
                onPress={() => {
                  void sendComment();
                }}
                disabled={!commentText.trim() || sendingComment}
                style={({ pressed }) => [
                  styles.commentSendBtn,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: !commentText.trim() || sendingComment ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                {sendingComment ? <ActivityIndicator size="small" color="#fff" /> : <AppText style={styles.commentSendText}>↑</AppText>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: '#000000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: '50%',
    maxHeight: '74%',
    borderTopWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  panelHandle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  panelHandleBar: {
    padding: 6,
  },
  panelHandleBarInner: {
    width: 38,
    height: 4,
    borderRadius: 999,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
  },
  panelClose: {
    fontSize: 20,
    fontWeight: '600',
  },
  commentsLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  commentsList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    flexGrow: 1,
  },
  commentsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  commentsEmptyEmoji: {
    fontSize: 30,
  },
  commentsEmptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  commentAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  commentBody: {
    flex: 1,
    gap: 3,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  commentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  commentInputField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  commentSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
});
