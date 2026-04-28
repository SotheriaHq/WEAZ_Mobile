import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { tokens } from '@/src/styles/tokens';

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
  return (
    <AppBottomSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <SelectSheetState loading={loading} errorMessage={errorMessage} empty={options.length === 0} emptyMessage={emptyMessage} />
      <View style={styles.optionWrap}>
        {options.map((option) => (
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
  emptyMessage = 'No options available.',
  maxSelected,
}: MultiProps) {
  const [draft, setDraft] = useState<string[]>(values);
  const selectedSet = useMemo(() => new Set(draft), [draft]);

  useEffect(() => {
    if (visible) {
      setDraft(values);
    }
  }, [values, visible]);

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
      <SelectSheetState loading={loading} errorMessage={errorMessage} empty={options.length === 0} emptyMessage={emptyMessage} />
      {typeof maxSelected === 'number' ? (
        <AppText variant="captionRegular" tone="muted">
          {draft.length}/{maxSelected} selected
        </AppText>
      ) : null}
      <View style={styles.optionWrap}>
        {options.map((option) => (
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
    </AppBottomSheet>
  );
}

function SelectSheetState({
  loading,
  errorMessage,
  empty,
  emptyMessage,
}: {
  loading?: boolean;
  errorMessage?: string | null;
  empty: boolean;
  emptyMessage: string;
}) {
  if (loading) return <AppText variant="body" tone="muted">Loading options...</AppText>;
  if (errorMessage) return <AppText variant="body" tone="danger">{errorMessage}</AppText>;
  if (empty) return <AppText variant="body" tone="muted">{emptyMessage}</AppText>;
  return null;
}

const styles = StyleSheet.create({
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
});

export default AppSelectSheet;
