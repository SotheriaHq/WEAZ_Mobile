import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchApi } from '@/src/api/SearchApi';
import { LAYOUT, tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type {
  SearchEntityType,
  SearchItem,
  SearchSuggestionLink,
  SearchSuggestionResponse,
  SearchTrendingLink,
} from '@/src/types/search';
import { routeForSearchItem } from '@/src/utils/mobileRouting';
import {
  getHiddenSearches,
  getLocalRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
} from '@/src/utils/searchHistory';
import { perfMeasure } from '@/src/utils/perf';
import MobileMarketSuggestionBlocks from '@/src/features/market/components/MobileMarketSuggestionBlocks';

type FilterType = 'all' | SearchEntityType;

type ResultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: SearchItem[]; hasNextPage: boolean }
  | { status: 'empty' }
  | { status: 'error'; message: string };

const FILTER_OPTIONS: Array<{ key: FilterType; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'brand', label: 'Brands' },
  { key: 'design', label: 'Runway' },
  { key: 'collection', label: 'Collections' },
  { key: 'product', label: 'Products' },
  { key: 'tag', label: 'Tags' },
];
const SEARCH_SCREEN_DEBOUNCE_MS = 350;

function getErrorMessage(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } }; message?: string })?.response?.data?.message;
  if (Array.isArray(message)) {
    return message.filter(Boolean).join(', ');
  }
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Search is unavailable right now.';
}

function normalizeQuery(value: string) {
  return value.trim();
}

function combineRecentQueries(
  localRecent: string[],
  remoteRecent: SearchSuggestionLink[],
  hiddenQueries: string[],
) {
  const hiddenSet = new Set(hiddenQueries);
  const merged = [
    ...localRecent.map((query) => ({ query, href: `/search?q=${encodeURIComponent(query)}` })),
    ...remoteRecent,
  ];
  const seen = new Set<string>();
  return merged.filter((entry) => {
    const key = entry.query.trim().toLowerCase();
    if (!key || hiddenSet.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildSuggestionItems(payload: SearchSuggestionResponse): SearchItem[] {
  return [
    ...payload.brands.items,
    ...payload.designs.items,
    ...payload.storeCollections.items,
    ...payload.products.items,
    ...payload.tags.map((tag) => ({
      id: tag.id,
      type: 'tag' as const,
      title: tag.title,
      href: tag.href,
      score: tag.score,
    })),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

function SearchSection({
  title,
  rightAction,
  children,
}: {
  title: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="subtitle">{title}</AppText>
        {rightAction}
      </View>
      {children}
    </View>
  );
}

function QueryRow({
  label,
  onPress,
  onRemove,
}: {
  label: string;
  onPress: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.queryRow}>
      <Pressable onPress={onPress} style={styles.queryCopy}>
        <AppText variant="bodyBold">🕘</AppText>
        <AppText variant="body" numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} style={styles.queryRemove}>
          <AppText variant="captionBold" tone="muted">✕</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function SearchResultRow({
  item,
  onPress,
}: {
  item: SearchItem;
  onPress: () => void;
}) {
  const typeLabel =
    item.type === 'brand'
      ? 'Brand'
      : item.type === 'design'
        ? 'Runway'
        : item.type === 'collection'
          ? 'Collection'
          : item.type === 'product'
            ? 'Product'
            : '# Tag';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}>
      <View style={styles.resultMeta}>
        <AppText variant="captionBold" tone="primary">
          {typeLabel}
        </AppText>
        <AppText variant="bodyBold" numberOfLines={1}>
          {item.title}
        </AppText>
        {item.subtitle ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        ) : null}
        {item.description ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
            {item.description}
          </AppText>
        ) : null}
      </View>
      <AppText variant="subtitle" tone="muted">›</AppText>
    </Pressable>
  );
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string | string[]; type?: string | string[]; autoSubmit?: string | string[] }>();
  const initialQuery = Array.isArray(params.q) ? params.q[0] : params.q ?? '';
  const initialType = Array.isArray(params.type) ? params.type[0] : params.type;
  const autoSubmit = Array.isArray(params.autoSubmit) ? params.autoSubmit[0] : params.autoSubmit;

  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [filterType, setFilterType] = useState<FilterType>(
    initialType === 'brand' || initialType === 'design' || initialType === 'collection' || initialType === 'product' || initialType === 'tag'
      ? initialType
      : 'all',
  );
  const [suggestions, setSuggestions] = useState<SearchSuggestionResponse | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [localRecent, setLocalRecent] = useState<string[]>([]);
  const [hiddenRecent, setHiddenRecent] = useState<string[]>([]);
  const [resultState, setResultState] = useState<ResultState>({ status: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const activeSearchRequestKeyRef = useRef<string | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const normalizedQuery = normalizeQuery(query);
  const recentQueries = useMemo(
    () => combineRecentQueries(localRecent, suggestions?.recent ?? [], hiddenRecent),
    [hiddenRecent, localRecent, suggestions?.recent],
  );
  const suggestedItems = useMemo(
    () => (suggestions ? buildSuggestionItems(suggestions) : []),
    [suggestions],
  );
  const hasActiveQuery = normalizedQuery.length > 0;
  const hasTrending = Boolean(suggestions?.trending?.length);
  const showRecentSection = recentQueries.length > 0;
  const showSuggestionSection = !suggestionsError && (suggestedItems.length > 0 || (hasActiveQuery && suggestionsLoading));
  const showSuggestionRetry = hasActiveQuery && Boolean(suggestionsError) && !suggestionsLoading;
  const showPopularSection = hasTrending;
  const showDefaultPrompt =
    resultState.status === 'idle' &&
    !hasActiveQuery &&
    !showRecentSection &&
    !showSuggestionSection &&
    !showPopularSection;

  useEffect(() => {
    perfMeasure('runway-search-first-paint', 'runway-search-tap');
  }, []);

  const loadSuggestions = useCallback(async (value: string, signal?: AbortSignal) => {
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    try {
      const payload = await SearchApi.suggest({ q: value || undefined }, signal);
      if (requestIdRef.current !== nextRequestId) return;
      setSuggestions(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (requestIdRef.current !== nextRequestId) return;
      setSuggestionsError(getErrorMessage(error));
    } finally {
      if (requestIdRef.current === nextRequestId) {
        setSuggestionsLoading(false);
      }
    }
  }, []);

  const runSearch = useCallback(
    async (
      searchValue: string,
      nextType: FilterType = filterType,
      options: { saveToRecent?: boolean } = {},
    ) => {
      const normalized = normalizeQuery(searchValue);
      if (!normalized) {
        setResultState({ status: 'idle' });
        return;
      }

      const requestKey = `${normalized}::${nextType}`;
      if (activeSearchRequestKeyRef.current === requestKey) return;

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      activeSearchRequestKeyRef.current = requestKey;

      setResultState({ status: 'loading' });
      try {
        const payload = await SearchApi.search({
          q: normalized,
          type: nextType === 'all' ? 'all' : nextType,
          page: 1,
          limit: 24,
        }, controller.signal);
        if (payload.items.length === 0) {
          setResultState({ status: 'empty' });
        } else {
          setResultState({
            status: 'ready',
            items: payload.items,
            hasNextPage: payload.meta.hasNextPage,
          });
        }
        if (options.saveToRecent !== false) {
          await saveRecentSearch(normalized);
          setLocalRecent(await getLocalRecentSearches());
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setResultState({ status: 'error', message: getErrorMessage(error) });
      } finally {
        if (activeSearchRequestKeyRef.current === requestKey) {
          activeSearchRequestKeyRef.current = null;
        }
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
      }
    },
    [filterType],
  );

  useEffect(() => {
    let mounted = true;
    const interaction = InteractionManager.runAfterInteractions(() => {
      Promise.all([getLocalRecentSearches(), getHiddenSearches()])
        .then(([recent, hidden]) => {
          if (!mounted) return;
          setLocalRecent(recent);
          setHiddenRecent(hidden);
        })
        .catch(() => undefined);
    });

    return () => {
      mounted = false;
      interaction.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      suggestAbortRef.current?.abort();
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    let cancelled = false;

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      debounceRef.current = setTimeout(() => {
        void loadSuggestions(normalizedQuery, controller.signal);
        if (normalizedQuery) {
          void runSearch(normalizedQuery, filterType, { saveToRecent: false });
        } else {
          searchAbortRef.current?.abort();
          setResultState({ status: 'idle' });
        }
      }, SEARCH_SCREEN_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      controller.abort();
    };
  }, [filterType, loadSuggestions, normalizedQuery, runSearch]);

  useEffect(() => {
    if (autoSubmit === '1' || autoSubmit === 'true') {
      const interaction = InteractionManager.runAfterInteractions(() => {
        void runSearch(initialQuery, filterType);
      });
      return () => interaction.cancel();
    }
  }, [autoSubmit, filterType, initialQuery, runSearch]);

  const openSearchItem = useCallback((item: SearchItem) => {
    void saveRecentSearch(item.title);
    router.push(routeForSearchItem(item));
  }, []);

  const removeRecent = useCallback(async (value: string) => {
    await removeRecentSearch(value);
    setLocalRecent(await getLocalRecentSearches());
    setHiddenRecent(await getHiddenSearches());
  }, []);

  const onSubmitSearch = useCallback(() => {
    void runSearch(query, filterType, { saveToRecent: true });
  }, [filterType, query, runSearch]);

  const onClearQuery = useCallback(() => {
    suggestAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    setQuery('');
    setResultState({ status: 'idle' });
  }, []);

  const onRetrySuggestions = useCallback(() => {
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    void loadSuggestions(normalizedQuery, controller.signal);
  }, [loadSuggestions, normalizedQuery]);

  const contentBottom = insets.bottom + LAYOUT.TAB_BAR_HEIGHT + tokens.spacing.xl;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)" emoji="👈" />
        <View style={styles.searchInputWrap}>
          <Input
            label="Search"
            hideLabel
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSubmitSearch}
            placeholder="Search Threadly"
            returnKeyType="search"
            trailing={
              query.length > 0 ? (
                <Pressable
                  onPress={onClearQuery}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.clearSearchButton}
                >
                  <AppText variant="captionBold" tone="muted">✕</AppText>
                </Pressable>
              ) : null
            }
            containerStyle={styles.searchFieldContainer}
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroller}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_OPTIONS.map((option) => {
            const selected = option.key === filterType;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  setFilterType(option.key);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <AppText variant="captionBold" tone={selected ? 'primary' : 'muted'}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {resultState.status === 'loading' ? (
          <Card>
            <View style={styles.stateBlock}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <AppText variant="body" tone="muted">Searching Threadly...</AppText>
            </View>
          </Card>
        ) : null}

        {resultState.status === 'error' ? (
          <Card>
            <View style={styles.stateBlock}>
              <AppText variant="subtitle">⚠️</AppText>
              <AppText variant="bodyBold">Search failed</AppText>
              <AppText variant="body" tone="muted">{resultState.message}</AppText>
              <Button title="Retry" onPress={onSubmitSearch} size="sm" />
            </View>
          </Card>
        ) : null}

        {resultState.status === 'empty' ? (
          <Card>
            <View style={styles.stateBlock}>
              <AppText variant="subtitle">🫥</AppText>
              <AppText variant="bodyBold">No results found</AppText>
              <AppText variant="body" tone="muted">Try a different keyword, handle, or tag.</AppText>
            </View>
          </Card>
        ) : null}

        {resultState.status === 'empty' && normalizeQuery(query) ? (
          <MobileMarketSuggestionBlocks
            context="SEARCH_EMPTY"
            targetType="QUERY"
            query={normalizeQuery(query)}
            surface="SEARCH"
            screenContext="SEARCH_EMPTY"
          />
        ) : null}

        {resultState.status === 'ready' ? (
          <SearchSection
            title="Results"
            rightAction={
              <AppText variant="captionRegular" tone="muted">
                {resultState.items.length} matches
              </AppText>
            }
          >
            <Card padding="md">
              <FlatList
                data={resultState.items}
                scrollEnabled={false}
                keyExtractor={(item) => `${item.type}-${item.id}`}
                ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.xs }} />}
                renderItem={({ item }) => (
                  <SearchResultRow item={item} onPress={() => openSearchItem(item)} />
                )}
              />
            </Card>
          </SearchSection>
        ) : (
          <>
            {showSuggestionRetry ? (
              <View style={[styles.suggestionRetryRow, { borderColor: theme.colors.border }]}>
                <AppText variant="captionRegular" tone="muted">
                  Suggestions unavailable.
                </AppText>
                <Pressable onPress={onRetrySuggestions} accessibilityRole="button" accessibilityLabel="Retry suggestions">
                  <AppText variant="captionBold" tone="primary">Retry</AppText>
                </Pressable>
              </View>
            ) : null}

            {showRecentSection ? (
              <SearchSection
                title="Recent searches"
                rightAction={
                  <Pressable
                    onPress={async () => {
                      for (const entry of recentQueries) {
                        await removeRecentSearch(entry.query);
                      }
                      setLocalRecent(await getLocalRecentSearches());
                      setHiddenRecent(await getHiddenSearches());
                    }}
                  >
                    <AppText variant="captionBold" tone="muted">Clear</AppText>
                  </Pressable>
                }
              >
                <View style={styles.sectionStack}>
                  {recentQueries.map((entry) => (
                    <QueryRow
                      key={entry.query}
                      label={entry.query}
                      onPress={() => {
                        setQuery(entry.query);
                        void runSearch(entry.query);
                      }}
                      onRemove={() => {
                        void removeRecent(entry.query);
                      }}
                    />
                  ))}
                </View>
              </SearchSection>
            ) : null}

            {showSuggestionSection ? (
              <SearchSection title="You may like">
                <View style={styles.sectionStack}>
                  {suggestionsLoading ? (
                    <View style={styles.stateInline}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <AppText variant="body" tone="muted">Loading suggestions...</AppText>
                    </View>
                  ) : (
                    suggestedItems.map((item) => (
                      <SearchResultRow key={`${item.type}-${item.id}`} item={item} onPress={() => openSearchItem(item)} />
                    ))
                  )}
                </View>
              </SearchSection>
            ) : null}

            {showPopularSection ? (
              <SearchSection
                title="Popular on Threadly"
                rightAction={
                  <AppText variant="captionRegular" tone="muted">{suggestions?.trending?.length ?? 0} trending</AppText>
                }
              >
                <View style={styles.sectionStack}>
                  {suggestions?.trending.map((trend: SearchTrendingLink) => (
                    <Pressable
                      key={trend.query}
                      onPress={() => {
                        setQuery(trend.query);
                        void runSearch(trend.query);
                      }}
                      style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}
                    >
                      <View style={styles.resultMeta}>
                        <AppText variant="captionBold" tone="primary">🔥 Trending</AppText>
                        <AppText variant="bodyBold">{trend.query}</AppText>
                      </View>
                      <AppText variant="subtitle" tone="muted">›</AppText>
                    </Pressable>
                  ))}
                </View>
              </SearchSection>
            ) : null}

            {showDefaultPrompt ? (
              <View style={styles.defaultPrompt}>
                <AppText variant="bodyBold" style={styles.defaultPromptTitle}>
                  👀 What are you looking for?
                </AppText>
                <AppText variant="small" tone="muted" style={styles.defaultPromptCopy}>
                  Search brands, runway looks, collections,{'\n'}products, or tags.
                </AppText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
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
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  searchFieldContainer: {
    marginBottom: 0,
  },
  clearSearchButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.full,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
  },
  filterScroller: {
    alignSelf: 'stretch',
  },
  filterRow: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs / 2,
    paddingVertical: tokens.spacing.sm,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  sectionStack: {
    gap: tokens.spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  queryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 52,
  },
  queryCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  queryRemove: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.full,
  },
  resultRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  resultMeta: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.82,
  },
  stateBlock: {
    minHeight: 168,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  stateInline: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  suggestionRetryRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  defaultPrompt: {
    alignSelf: 'stretch',
    minHeight: 220,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
  },
  defaultPromptTitle: {
    width: '100%',
    textAlign: 'center',
  },
  defaultPromptCopy: {
    width: '100%',
    textAlign: 'center',
  },
});
