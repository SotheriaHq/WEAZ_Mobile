import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import TagsApi, { type TagSuggestion } from '@/src/api/TagsApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import {
  isValidTagValue,
  normalizeTagList,
  normalizeTagValue,
  TAG_MAX_LENGTH,
  TAG_MIN_LENGTH,
} from '@/src/utils/tagNormalization';

export type SelectSheetOption = {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  pending?: boolean;
};

type BaseProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SelectSheetOption[];
  onClose: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
};

type SingleProps = BaseProps & {
  value: string | null;
  onChange: (value: string) => void;
};

type MultiProps = BaseProps & {
  values: string[];
  onChange: (values: string[]) => void;
  maxSelected?: number;
  popularLabel?: string;
  searchInputLabel?: string;
  searchPlaceholder?: string;
  searchEmptyMessage?: string;
  customInputLabel?: string;
  customPlaceholder?: string;
  doneLabel?: string;
};

function AnimatedOptionCard({
  option,
  selected,
  onPress,
}: {
  option: SelectSheetOption;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={option.disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { stiffness: 300, damping: 20 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { stiffness: 300, damping: 20 });
      }}
    >
      <Animated.View
        style={[
          styles.optionCard,
          animatedStyle,
          {
            backgroundColor: selected
              ? theme.colors.primarySoft
              : theme.colors.surfaceAlt,
            borderColor: selected
              ? theme.colors.primary
              : option.pending
                ? theme.colors.warning
                : theme.colors.border,
          },
          option.disabled && styles.optionDisabled,
        ]}
      >
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
          <AppText
            variant="bodyBold"
            tone={selected ? 'primary' : option.pending ? 'warning' : 'default'}
          >
            {option.label}
          </AppText>
          {option.description ? (
            <AppText variant="captionRegular" tone="muted">
              {option.description}
            </AppText>
          ) : null}
        </View>
        {selected || option.pending ? (
          <AppText
            variant="captionBold"
            tone={selected ? 'primary' : 'warning'}
            accessibilityLabel={selected ? 'Selected' : 'Pending review'}
          >
            {selected ? 'Selected' : 'Pending'}
          </AppText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export function AppSelectSheet({
  visible,
  title,
  subtitle,
  options,
  value,
  onChange,
  onClose,
  loading,
  errorMessage,
  emptyMessage = 'No options available.',
}: SingleProps) {
  const pendingValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible) pendingValueRef.current = null;
  }, [visible]);

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onDismiss={() => {
        const nextValue = pendingValueRef.current;
        pendingValueRef.current = null;
        if (nextValue !== null) onChange(nextValue);
      }}
      keyboardBehavior="none"
    >
      <SelectSheetState
        loading={loading}
        errorMessage={errorMessage}
        empty={options.length === 0}
        emptyMessage={emptyMessage}
      />
      <View style={styles.optionWrapSingle}>
        {options.map((option) => (
          <AnimatedOptionCard
            key={option.value}
            option={option}
            selected={option.value === value}
            onPress={() => {
              if (option.disabled) return;
              // Apply immediately, then close. Deferring onChange to onDismiss
              // left the sheet stuck open when the close animation was cancelled
              // (selecting the already-active "All categories" was the repro:
              // visible flipped false, finished=false, finishDismiss never ran).
              onChange(option.value);
              pendingValueRef.current = null;
              onClose();
            }}
          />
        ))}
      </View>
    </AppBottomSheet>
  );
}

export function AppMultiSelectSheet({
  visible,
  title,
  subtitle,
  options,
  values,
  onChange,
  onClose,
  loading,
  errorMessage,
  onRetry,
  emptyMessage = 'No options available.',
  maxSelected,
  popularLabel = 'Popular Tags:',
  searchInputLabel = 'Search tags',
  searchPlaceholder = 'Search or create a tag...',
  searchEmptyMessage = 'No suggestions found. Type a tag and tap Add.',
  customInputLabel = 'Custom tag',
  customPlaceholder = 'Add custom tag',
  doneLabel = 'Done',
}: MultiProps) {
  const [draft, setDraft] = useState<string[]>(values);
  const [customTag, setCustomTag] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<TagSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'search' | 'custom' | null>(
    null,
  );
  // Tags the user just created via "Add" this session. They are usable on this
  // post immediately and are sent to admin for global approval when the design is
  // submitted (the backend creates them with status PENDING). Tracked only to show
  // the distinct "pending review" chip treatment — not a separate API call.
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const pendingValuesRef = useRef<string[] | null>(null);
  const selectedSet = useMemo(
    () => new Set(draft.map(normalizeTagValue)),
    [draft],
  );
  const knownOptionValues = useMemo(
    () =>
      new Set(
        options
          .map((option) => normalizeTagValue(option.value))
          .filter(Boolean),
      ),
    [options],
  );
  const pendingOptionValues = useMemo(
    () =>
      new Set(
        options
          .filter((option) => option.pending)
          .map((option) => normalizeTagValue(option.value)),
      ),
    [options],
  );
  const pendingSet = useMemo(
    () =>
      new Set([
        ...draft
          .map(normalizeTagValue)
          .filter(
            (value) =>
              !knownOptionValues.has(value) || pendingOptionValues.has(value),
          ),
        ...pendingTags.map(normalizeTagValue),
      ]),
    [draft, knownOptionValues, pendingOptionValues, pendingTags],
  );
  const optionLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();
    options.forEach((option) =>
      labels.set(normalizeTagValue(option.value), option.label),
    );
    return labels;
  }, [options]);
  const selectedOptions = useMemo(
    () =>
      draft.map((value) => ({
        value: normalizeTagValue(value),
        label:
          optionLabelByValue.get(normalizeTagValue(value)) ??
          `#${normalizeTagValue(value)}`,
      })),
    [draft, optionLabelByValue],
  );

  useEffect(() => {
    if (visible) {
      const normalizedValues = normalizeTagList(values, maxSelected ?? 10);
      setDraft(normalizedValues);
      setCustomTag('');
      setSearchText('');
      setSearchResults([]);
      setIsSearching(false);
      setFocusedInput(null);
      setPendingTags((current) =>
        current.filter((tag) =>
          normalizedValues.includes(normalizeTagValue(tag)),
        ),
      );
      pendingValuesRef.current = null;
    }
  }, [maxSelected, values, visible]);

  useEffect(() => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const results = await TagsApi.searchTags(trimmed, 20);
        if (active) setSearchResults(results);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchText]);

  const toggle = (value: string) => {
    const normalized = normalizeTagValue(value);
    if (!normalized) return;
    setDraft((current) => {
      if (current.includes(normalized)) {
        return current.filter((entry) => entry !== normalized);
      }
      if (typeof maxSelected === 'number' && current.length >= maxSelected) {
        return current;
      }
      return [...current, normalized];
    });
    // Deselecting a pending custom tag clears its pending marker too.
    setPendingTags((current) =>
      current.includes(normalized)
        ? current.filter((entry) => entry !== normalized)
        : current,
    );
  };

  const displayedOptions = useMemo(() => {
    const trimmed = searchText.trim().toLowerCase();
    let mappedOptions = [];

    if (!trimmed) {
      mappedOptions = options.map((opt) => ({
        value: normalizeTagValue(opt.value),
        label: opt.label,
        usageCount: (opt as any).usageCount ?? 0,
        disabled: opt.disabled,
        pending: opt.pending,
      }));
    } else {
      const localFiltered = options
        .filter((opt) => opt.label.toLowerCase().includes(trimmed) || opt.value.toLowerCase().includes(trimmed))
        .map((opt) => ({
          value: normalizeTagValue(opt.value),
          label: opt.label,
          usageCount: (opt as any).usageCount ?? 0,
          disabled: opt.disabled,
          pending: opt.pending,
        }));
        
      const localValues = new Set(localFiltered.map((o) => normalizeTagValue(o.value)));
      const networkMapped = searchResults
        .filter((opt) => !localValues.has(normalizeTagValue(opt.name)))
        .map((opt) => ({
          value: normalizeTagValue(opt.name),
          label: `#${normalizeTagValue(opt.name)}`,
          usageCount: opt.usageCount,
          disabled: false,
          pending: opt.status === 'PENDING',
        }));
        
      mappedOptions = [...localFiltered, ...networkMapped];
    }

    return mappedOptions.filter((opt) => opt.value && !selectedSet.has(normalizeTagValue(opt.value)));
  }, [searchText, searchResults, options, selectedSet]);

  const addCustomTag = () => {
    const normalized = normalizeTagValue(customTag);
    if (!isValidTagValue(normalized) || draft.includes(normalized) || (typeof maxSelected === 'number' && draft.length >= maxSelected)) {
      return;
    }
    setDraft((current) => [...current, normalized]);
    const knownOption = options.find((option) => normalizeTagValue(option.value) === normalized);
    const knownSearchResult = searchResults.find((result) => normalizeTagValue(result.name) === normalized);
    const isKnownApprovedTag = Boolean(knownOption && !knownOption.pending) || knownSearchResult?.status === 'APPROVED';
    if (!isKnownApprovedTag) {
      setPendingTags((current) => (current.includes(normalized) ? current : [...current, normalized]));
    }
    setCustomTag('');
  };

  const normalizedCustomTag = normalizeTagValue(customTag);
  const customTagIsDuplicate = draft.includes(normalizedCustomTag);
  const customTagError =
    customTag.trim() && !isValidTagValue(normalizedCustomTag)
      ? `Use at least ${TAG_MIN_LENGTH} letters or numbers.`
      : customTagIsDuplicate
        ? 'This hashtag is already selected.'
        : undefined;

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onDismiss={() => {
        const nextValues = pendingValuesRef.current;
        pendingValuesRef.current = null;
        if (nextValues) onChange(nextValues);
      }}
      onDone={() => {
        pendingValuesRef.current = normalizeTagList(draft, maxSelected ?? 10);
        onClose();
      }}
      scrollable={false}
      doneLabel={doneLabel}
      keyboardBehavior="auto"
      keyboardActive={focusedInput !== null}
      headerMeta={
        typeof maxSelected === 'number'
          ? `${draft.length}/${maxSelected}`
          : `${draft.length} selected`
      }
    >
      <SelectSheetState
        loading={(loading || isSearching) && displayedOptions.length === 0}
        errorMessage={errorMessage}
        onRetry={onRetry}
        empty={displayedOptions.length === 0 && selectedOptions.length === 0}
        emptyMessage={searchText.trim() ? searchEmptyMessage : emptyMessage}
      />
      <Input
        label={searchInputLabel}
        hideLabel
        value={searchText}
        onChangeText={setSearchText}
        placeholder={searchPlaceholder}
        containerStyle={styles.searchInput}
        onFocus={() => setFocusedInput('search')}
        onBlur={() =>
          setFocusedInput((current) => (current === 'search' ? null : current))
        }
      />
      {selectedOptions.length > 0 ? (
        <View style={styles.selectedSection}>
          <AppText variant="bodyBold" style={styles.sectionTitle}>
            Selected
          </AppText>
          <View style={styles.optionWrap}>
            {selectedOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected
                pending={pendingSet.has(option.value)}
                onPress={() => toggle(option.value)}
              />
            ))}
          </View>
          {selectedOptions.some((option) => pendingSet.has(option.value)) ? (
            <AppText variant="captionRegular" tone="muted">
              Pending tags are available on this design now while global review
              continues.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {!searchText.trim() && options.length > 0 ? (
          <AppText variant="bodyBold" style={styles.sectionTitle}>
            {popularLabel}
          </AppText>
        ) : null}
        <View style={styles.optionWrap}>
          {displayedOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedSet.has(option.value)}
              pending={option.pending}
              disabled={option.disabled}
              onPress={() => {
                if (!option.disabled) toggle(option.value);
              }}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.customTagRow}>
        <Input
          label={customInputLabel}
          hideLabel
          value={customTag}
          onChangeText={setCustomTag}
          placeholder={customPlaceholder}
          containerStyle={styles.customTagInput}
          maxLength={TAG_MAX_LENGTH}
          error={customTagError}
          onFocus={() => setFocusedInput('custom')}
          onBlur={() =>
            setFocusedInput((current) =>
              current === 'custom' ? null : current,
            )
          }
        />
        <Button
          title="Add"
          size="sm"
          disabled={
            !isValidTagValue(normalizedCustomTag) ||
            customTagIsDuplicate ||
            (typeof maxSelected === 'number' && draft.length >= maxSelected)
          }
          onPress={addCustomTag}
          style={styles.addButton}
        />
      </View>
    </AppBottomSheet>
  );
}

function SelectSheetState({
  loading,
  errorMessage,
  onRetry,
  empty,
  emptyMessage,
}: {
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  empty: boolean;
  emptyMessage: string;
}) {
  if (loading)
    return (
      <AppText variant="body" tone="muted">
        Loading options...
      </AppText>
    );
  if (errorMessage) {
    return (
      <View style={styles.stateBlock}>
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
        {onRetry ? (
          <Button
            title="Retry"
            size="sm"
            variant="secondary"
            onPress={onRetry}
          />
        ) : null}
      </View>
    );
  }
  if (empty)
    return (
      <AppText variant="body" tone="muted">
        {emptyMessage}
      </AppText>
    );
  return null;
}

const styles = StyleSheet.create({
  optionWrapSingle: {
    gap: tokens.spacing.sm,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  stateBlock: {
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  optionCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  searchInput: {
    marginBottom: tokens.spacing.sm,
  },
  sectionTitle: {
    marginBottom: tokens.spacing.sm,
  },
  selectedSection: {
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  customTagRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    alignItems: 'flex-end',
    marginTop: tokens.spacing.md,
  },
  customTagInput: {
    flex: 1,
  },
  addButton: {
    height: 52,
  },
  scrollArea: {
    flexShrink: 1,
    // Bounded height so the tag list always scrolls when tags overflow instead of
    // relying on flex propagation through the sheet (which left it unscrollable on
    // Android). Caps the popular/suggested list; the parent sheet still owns layout.
    maxHeight: 280,
    marginTop: tokens.spacing.sm,
  },
  scrollContent: {
    paddingBottom: tokens.spacing.xs,
  },
});

export default AppSelectSheet;
