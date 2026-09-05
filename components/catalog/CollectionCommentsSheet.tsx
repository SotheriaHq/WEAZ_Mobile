import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiClient } from '@/src/api/httpClient';
import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { tokens } from '@/src/styles/tokens';
import { MuseLoader } from '@/components/ui/MuseLoader';

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
  /**
   * 0 = closed, 1 = fully open. Supply one to couple something else to this
   * sheet's motion — the Runway scales its page down into the band above the
   * sheet, and it has to move on exactly the same frames, not merely for the
   * same duration. When omitted the sheet drives an internal value and behaves
   * as before.
   */
  progress?: Animated.Value;
  /** Measured sheet height, so a caller can compute how much room is left. */
  onSheetHeight?: (height: number) => void;
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
              padding: 12,
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
        <AppText variant="bodyBold" tone="primary">{authorName.slice(0, 1).toUpperCase()}</AppText>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <AppText variant="smallBold">{authorName}</AppText>
          {time ? (
            <AppText variant="captionRegular" tone="muted"> 
              {time}
            </AppText>
          ) : null}
        </View>
        <AppText variant="small" tone="secondary" style={styles.commentText}> 
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
  progress: progressProp,
  onSheetHeight,
}: CollectionCommentsSheetProps) {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const androidBottomGap = Platform.OS === 'android' ? Math.max(0, insets.bottom) : 0;
  /**
   * ONE value drives everything: the sheet's slide, the scrim's fade, and any
   * coupled motion the caller asked for. Two separate animations of the same
   * duration drift; one interpolated value cannot.
   */
  const internalProgress = useRef(new Animated.Value(0)).current;
  const progress = progressProp ?? internalProgress;
  const [sheetHeight, setSheetHeight] = useState(0);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight > 0 ? sheetHeight : 480, 0],
  });
  const opacity = progress;
  const [mounted, setMounted] = useState(visible);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const commentsListRef = useRef<FlatList<Comment> | null>(null);

  useAndroidOverlaySystemBars(visible, scheme, 'collection-comments');

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
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
        isInteraction: false,
      }).start(({ finished }) => {
        if (!finished) return;
        setMounted(false);
        setCommentText('');
      });
      return;
    }

    setMounted(true);
    void loadComments(collectionId);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      isInteraction: false,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [collectionId, loadComments, progress, visible]);

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
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Pressable style={styles.scrim} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? tokens.viewer.surface : tokens.colors.light,
              borderTopColor: theme.colors.border,
              marginBottom: androidBottomGap,
              paddingBottom: Platform.OS === 'android' ? 0 : insets.bottom,
              transform: [{ translateY }],
            },
          ]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            if (next <= 0 || next === sheetHeight) return;
            setSheetHeight(next);
            onSheetHeight?.(next);
          }}
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
              <AppText variant="subtitle">Comments</AppText>
              {collectionTitle ? (
                <AppText variant="captionRegular" tone="muted" style={styles.panelSubtitle} numberOfLines={1}>
                  {collectionTitle}
                </AppText>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <AppText variant="h2" tone="secondary"> 
                ×
              </AppText>
            </Pressable>
          </View>

          {commentsLoading ? (
            <View style={styles.commentsLoading}>
              <MuseLoader size={20} />
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
                  <AppText variant="h1">💬</AppText>
                  <AppText variant="small" tone="muted" style={styles.commentsEmptyText}> 
                    No comments yet. Be the first.
                  </AppText>
                </View>
              }
            />
          )}

          <KeyboardAvoider>
            <View
              style={[
                styles.commentInput,
                {
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              {/* Shared primitive, not a raw input. `hideLabel` keeps the
                  accessible name without printing a label above a one-line
                  composer; the surrounding row already draws the container. */}
              <Input
                label="Add a comment"
                hideLabel
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment..."
                containerStyle={styles.commentInputField}
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
                {sendingComment ? <MuseLoader size={20} /> : <AppText variant="h3" tone="inverse">↑</AppText>}
              </Pressable>
            </View>
          </KeyboardAvoider>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /**
   * A dim, not a blackout.
   *
   * This was `tokens.colors.dark` — fully opaque black — animated to full opacity
   * across the entire screen, so opening comments did not "cover" the design,
   * it ERASED it: everything above the sheet went pure black. The whole point
   * of a comment sheet on a feed is to keep looking at the thing you are
   * commenting on. A scrim exists to push the content back, not to delete it.
   */
  scrim: {
    flex: 1,
    backgroundColor: tokens.scrim(0.55),
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
    padding: 8,
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
    gap: 12,
    flexGrow: 1,
  },
  commentsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  commentsEmptyText: {
    fontWeight: '500',
  },
  commentItem: {
    flexDirection: 'row',
    gap: 8,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  commentTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  commentText: {
    lineHeight: 18,
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  commentInputField: {
    flex: 1,
  },
  commentSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendText: {
    color: tokens.colors.light,
    fontSize: 18,
    fontWeight: '900',
  },
});
