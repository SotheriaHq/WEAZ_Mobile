import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
};

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
    <AppBottomSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <SelectSheetState loading={loading} errorMessage={errorMessage} empty={options.length === 0} emptyMessage={emptyMessage} />
      <View style={styles.optionWrap}>
        {options.map((option) => (
          option.description ? (
            <Pressable
              key={option.value}
              disabled={option.disabled}
              onPress={() => {
                if (option.disabled) return;
                onChange(option.value);
                onClose();
              }}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: option.value === value ? theme.colors.primary : theme.colors.border,
                },
                option.disabled && styles.optionDisabled,
                pressed && !option.disabled && styles.optionPressed,
              ]}
            >
              <AppText variant="bodyBold" tone={option.value === value ? 'primary' : 'default'}>
                {option.label}
              </AppText>
              <AppText variant="captionRegular" tone="muted">
                {option.description}
              </AppText>
            </Pressable>
          ) : (
            <Chip
              key={option.value}
              label={option.label}
              selected={option.value === value}
              disabled={option.disabled}
              onPress={() => {
                if (option.disabled) return;
                onChange(option.value);
                onClose();
              }}
            />
          )
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
}: MultiProps) {
  const [draft, setDraft] = useState<string[]>(values);
  const [customTag, setCustomTag] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<TagSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const selectedSet = useMemo(() => new Set(draft), [draft]);

  useEffect(() => {
    if (visible) {
      setDraft(values);
      setCustomTag('');
      setSearchText('');
      setSearchResults([]);
      setIsSearching(false);
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
  };

  const displayedOptions = useMemo(() => {
    const baseOptions = searchText.trim() ? searchResults : options;
    return baseOptions
      .map((opt) => {
        if ('name' in opt) { // TagSuggestion
          return { value: opt.name, label: `#${opt.name}`, usageCount: opt.usageCount, disabled: false };
        } else { // SelectSheetOption
          return { value: opt.value, label: opt.label, usageCount: (opt as any).usageCount ?? 0, disabled: opt.disabled };
        }
      })
      .filter((opt) => !selectedSet.has(opt.value));
  }, [searchText, searchResults, options, selectedSet]);

  const addCustomTag = () => {
    const normalized = customTag.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalized || draft.includes(normalized) || (typeof maxSelected === 'number' && draft.length >= maxSelected)) {
      return;
    }
    setDraft((current) => [...current, normalized]);
    setCustomTag('');
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onDone={() => {
        onChange(draft);
        onClose();
      }}
      doneLabel="Done"
    >
      <SelectSheetState
        loading={loading || isSearching}
        errorMessage={errorMessage}
        onRetry={onRetry}
        empty={displayedOptions.length === 0}
        emptyMessage={searchText.trim() ? "No suggestions found. Type a tag and tap Add." : emptyMessage}
      />
      <Input
        label="Search tags"
        hideLabel
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search or create a tag..."
        containerStyle={styles.searchInput}
      />
      {typeof maxSelected === 'number' ? (
        <AppText variant="captionRegular" tone="muted">
          {draft.length}/{maxSelected} selected
        </AppText>
      ) : null}
      {!searchText.trim() && options.length > 0 ? (
        <AppText variant="bodyBold" style={styles.sectionTitle}>Popular Tags:</AppText>
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
      <View style={styles.customTagRow}>
        <Input
          label="Custom tag"
          hideLabel
          value={customTag}
          onChangeText={setCustomTag}
          placeholder="Add custom tag"
          containerStyle={styles.customTagInput}
        />
        <Button
          title="Add"
          size="sm"
          disabled={!customTag.trim() || draft.includes(customTag.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))}
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
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: tokens.radius.md,
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.78,
  },
  searchInput: {
    marginBottom: tokens.spacing.sm,
  },
  sectionTitle: {
    marginBottom: tokens.spacing.sm,
  },
  customTagRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    alignItems: 'flex-end',
  },
  customTagInput: {
    flex: 1,
  },
});

export default AppSelectSheet;
