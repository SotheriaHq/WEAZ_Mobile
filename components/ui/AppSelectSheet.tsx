import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { FontAwesome5 } from '@expo/vector-icons';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import TagsApi, { type TagSuggestion } from '@/src/api/TagsApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type SelectSheetOption = {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
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

const normalizeCustomTagValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
            backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: selected ? 0.1 : 0.03,
            shadowRadius: 4,
            elevation: selected ? 2 : 1,
          },
          option.disabled && styles.optionDisabled,
        ]}
      >
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
          <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'}>
            {option.label}
          </AppText>
          {option.description ? (
            <AppText variant="captionRegular" tone="muted">
              {option.description}
            </AppText>
          ) : null}
        </View>
        {selected ? (
          <FontAwesome5 name="check-circle" size={18} color={theme.colors.primary} />
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
  const { theme } = useTheme();

  return (
    <AppBottomSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} keyboardBehavior="none">
      <SelectSheetState loading={loading} errorMessage={errorMessage} empty={options.length === 0} emptyMessage={emptyMessage} />
      <View style={styles.optionWrapSingle}>
        {options.map((option) => (
          <AnimatedOptionCard
            key={option.value}
            option={option}
            selected={option.value === value}
            onPress={() => {
              if (option.disabled) return;
              onClose();
              requestAnimationFrame(() => onChange(option.value));
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
  // Tags the user just created via "Add" this session. They are usable on this
  // post immediately and are sent to admin for global approval when the design is
  // submitted (the backend creates them with status PENDING). Tracked only to show
  // the distinct "pending review" chip treatment — not a separate API call.
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(draft), [draft]);
  const knownOptionValues = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const pendingSet = useMemo(
    () => new Set([...draft.filter((value) => !knownOptionValues.has(value)), ...pendingTags]),
    [draft, knownOptionValues, pendingTags],
  );
  const optionLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();
    options.forEach((option) => labels.set(option.value, option.label));
    return labels;
  }, [options]);
  const selectedOptions = useMemo(
    () =>
      draft.map((value) => ({
        value,
        label: optionLabelByValue.get(value) ?? `#${value}`,
      })),
    [draft, optionLabelByValue],
  );

  useEffect(() => {
    if (visible) {
      setDraft(values);
      setCustomTag('');
      setSearchText('');
      setSearchResults([]);
      setIsSearching(false);
      setPendingTags([]);
    }
  }, [values, visible]);

  useEffect(() => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await TagsApi.searchTags(trimmed, 20);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText]);

  const toggle = (value: string) => {
    setDraft((current) => {
      if (current.includes(value)) {
        return current.filter((entry) => entry !== value);
      }
      if (typeof maxSelected === 'number' && current.length >= maxSelected) {
        return current;
      }
      return [...current, value];
    });
    // Deselecting a pending custom tag clears its pending marker too.
    setPendingTags((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : current));
  };

  const displayedOptions = useMemo(() => {
    const trimmed = searchText.trim().toLowerCase();
    let mappedOptions = [];

    if (!trimmed) {
      mappedOptions = options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        usageCount: (opt as any).usageCount ?? 0,
        disabled: opt.disabled,
      }));
    } else {
      const localFiltered = options
        .filter((opt) => opt.label.toLowerCase().includes(trimmed) || opt.value.toLowerCase().includes(trimmed))
        .map((opt) => ({
          value: opt.value,
          label: opt.label,
          usageCount: (opt as any).usageCount ?? 0,
          disabled: opt.disabled,
        }));
        
      const localValues = new Set(localFiltered.map((o) => o.value));
      const networkMapped = searchResults
        .filter((opt) => !localValues.has(opt.name))
        .map((opt) => ({
          value: opt.name,
          label: `#${opt.name}`,
          usageCount: opt.usageCount,
          disabled: false,
        }));
        
      mappedOptions = [...localFiltered, ...networkMapped];
    }

    return mappedOptions.filter((opt) => !selectedSet.has(opt.value));
  }, [searchText, searchResults, options, selectedSet]);

  const addCustomTag = () => {
    const normalized = normalizeCustomTagValue(customTag);
    if (!normalized || draft.includes(normalized) || (typeof maxSelected === 'number' && draft.length >= maxSelected)) {
      return;
    }
    setDraft((current) => [...current, normalized]);
    // A freshly-typed tag is only "pending" if it is not already a known global
    // suggestion. Known suggestions are accepted immediately as approved tags.
    const isKnownGlobalTag =
      options.some((option) => option.value === normalized) ||
      searchResults.some((result) => result.name === normalized);
    if (!isKnownGlobalTag) {
      setPendingTags((current) => (current.includes(normalized) ? current : [...current, normalized]));
    }
    setCustomTag('');
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onDone={() => {
        const nextDraft = [...draft];
        onClose();
        requestAnimationFrame(() => onChange(nextDraft));
      }}
      scrollable={false}
      doneLabel={doneLabel}
      keyboardBehavior="auto"
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
      />
      {typeof maxSelected === 'number' ? (
        <AppText variant="captionRegular" tone="muted">
          {draft.length}/{maxSelected} selected
        </AppText>
      ) : null}
      {selectedOptions.length > 0 ? (
        <View style={styles.selectedSection}>
          <AppText variant="bodyBold" style={styles.sectionTitle}>Selected</AppText>
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
              Tags marked review are added to this post now and sent for global approval.
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
      >
        {!searchText.trim() && options.length > 0 ? (
          <AppText variant="bodyBold" style={styles.sectionTitle}>{popularLabel}</AppText>
        ) : null}
        <View style={styles.optionWrap}>
          {displayedOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedSet.has(option.value)}
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
        />
        <Button
          title="Add"
          size="sm"
          disabled={!normalizeCustomTagValue(customTag) || draft.includes(normalizeCustomTagValue(customTag))}
          onPress={addCustomTag}
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
  if (loading) return <AppText variant="body" tone="muted">Loading options...</AppText>;
  if (errorMessage) {
    return (
      <View style={styles.stateBlock}>
        <AppText variant="body" tone="danger">{errorMessage}</AppText>
        {onRetry ? <Button title="Retry" size="sm" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) return <AppText variant="body" tone="muted">{emptyMessage}</AppText>;
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
