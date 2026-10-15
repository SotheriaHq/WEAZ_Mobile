import React from 'react';
import { StyleSheet, View } from 'react-native';
import { isAxiosError } from 'axios';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The single non-content state for every screen.
 *
 * Surfaces used to each invent their own: Runway and Market had hand-built
 * cards, while search, orders, inbox and the section detail screens fell back to
 * a bare line of text — or rendered nothing at all, so a screen with no data was
 * indistinguishable from a screen that failed to load. That ambiguity is the
 * actual defect: "empty" and "broken" must never look the same, because only one
 * of them is worth retrying.
 *
 * Every kind below therefore answers three questions: what happened, whether it
 * is the user's doing or ours, and what action (if any) resolves it.
 */
export type ScreenStateKind =
  | 'empty' // nothing exists here yet — normal, not a failure
  | 'noResults' // the query/filters excluded everything
  | 'offline' // request never reached us
  | 'server' // reached us and we failed
  | 'notFound' // the specific resource is gone (404)
  | 'forbidden' // signed in, but not allowed (403)
  | 'guest' // signed out, and this surface needs an account
  | 'rateLimited'; // 429

type Preset = {
  emoji: string;
  title: string;
  message: string;
  /** Retry only helps when the failure might be transient. */
  retryable: boolean;
};

const PRESETS: Record<ScreenStateKind, Preset> = {
  empty: {
    emoji: '✨',
    title: 'Nothing here yet',
    message: 'When there is something to show, it will appear here.',
    retryable: false,
  },
  noResults: {
    emoji: '⌕',
    title: 'No matches',
    message: 'Nothing fits those filters. Try broadening or clearing them.',
    retryable: false,
  },
  offline: {
    emoji: '📡',
    title: 'You appear to be offline',
    message:
      'We could not reach WIEZ. Check your connection and try again — nothing has been lost.',
    retryable: true,
  },
  server: {
    emoji: '🛠️',
    title: 'Something went wrong on our end',
    message:
      'This is not you. The problem has been logged and retrying often works.',
    retryable: true,
  },
  notFound: {
    emoji: '🧭',
    title: "This doesn't exist anymore",
    message: 'It may have been removed, unpublished, or the link is out of date.',
    retryable: false,
  },
  forbidden: {
    emoji: '🔒',
    title: 'You do not have access',
    message: 'This belongs to someone else, or your role does not include it.',
    retryable: false,
  },
  guest: {
    emoji: '👋',
    title: 'Sign in to continue',
    message: 'Browsing is open to everyone. This part needs an account.',
    retryable: false,
  },
  rateLimited: {
    emoji: '⏳',
    title: 'Too many requests',
    message: 'Give it a few seconds, then try again.',
    retryable: true,
  },
};

/**
 * Maps a thrown error onto the state that describes it.
 *
 * Screens should not hand-classify errors — doing so is how "offline" ends up
 * rendered as "no results", which tells the user to change filters when the real
 * problem is their signal.
 */
export function classifyScreenState(error: unknown): ScreenStateKind {
  if (!error) return 'empty';

  if (isAxiosError(error)) {
    // No response at all — never reached the server.
    if (
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT'
    ) {
      return 'offline';
    }

    const status = error.response.status;
    if (status === 401) return 'guest';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notFound';
    if (status === 429) return 'rateLimited';
    if (status >= 500) return 'server';
  }

  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  if (/network|failed to fetch|timeout|econn/.test(message)) return 'offline';

  return 'server';
}

export type ScreenStateProps = {
  kind: ScreenStateKind;
  /** Override the preset copy when a surface can be more specific. */
  title?: string;
  message?: string;
  emoji?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void | Promise<void>;
  /** Short reassurance chips, e.g. ['📶 Check signal', '✈️ Airplane mode off']. */
  hints?: string[];
  /** Inline variant for use inside a list or section rather than a whole screen. */
  compact?: boolean;
  testID?: string;
};

export function ScreenState({
  kind,
  title,
  message,
  emoji,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  hints,
  compact = false,
  testID,
}: ScreenStateProps) {
  const { theme } = useTheme();
  const preset = PRESETS[kind];

  // A retryable state always offers the retry, even if the caller only passed a
  // handler — otherwise the user is told to try again with no way to do it.
  const resolvedActionLabel =
    actionLabel ?? (preset.retryable && onAction ? 'Try again' : undefined);

  return (
    <View
      style={[compact ? styles.wrapCompact : styles.wrap]}
      testID={testID}
      accessibilityRole="summary"
    >
      <Card variant="overlay" style={styles.card}>
        <View
          style={[
            compact ? styles.heroCompact : styles.hero,
            { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
          ]}
        >
          <AppText variant="display">{emoji ?? preset.emoji}</AppText>
        </View>

        <AppText variant="title" style={styles.centerText}>
          {title ?? preset.title}
        </AppText>
        <AppText variant="body" tone="muted" style={styles.centerText}>
          {message ?? preset.message}
        </AppText>

        {hints && hints.length > 0 ? (
          <View style={styles.hints}>
            {hints.map((hint) => (
              <View
                key={hint}
                style={[
                  styles.hintChip,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                ]}
              >
                <AppText variant="caption" tone="muted">
                  {hint}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {resolvedActionLabel && onAction ? (
          <Button
            title={resolvedActionLabel}
            onPress={onAction}
            variant="primary"
            size={compact ? 'md' : 'lg'}
            fullWidth={!compact}
          />
        ) : null}

        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            title={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="secondary"
            size={compact ? 'md' : 'lg'}
            fullWidth={!compact}
          />
        ) : null}
      </Card>
    </View>
  );
}

/**
 * Convenience wrapper: give it whatever the query threw and it picks the state.
 */
export function ErrorScreenState({
  error,
  onRetry,
  ...rest
}: { error: unknown; onRetry?: () => void | Promise<void> } & Omit<ScreenStateProps, 'kind'>) {
  const kind = classifyScreenState(error);
  return (
    <ScreenState
      kind={kind}
      onAction={PRESETS[kind].retryable ? onRetry : rest.onAction}
      hints={kind === 'offline' ? ['📶 Check signal', '✈️ Airplane mode off'] : rest.hints}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing['2xl'],
  },
  wrapCompact: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
  },
  card: {
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  hero: {
    width: 112,
    height: 112,
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroCompact: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  centerText: {
    textAlign: 'center',
  },
  hints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  hintChip: {
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
});

export default ScreenState;
