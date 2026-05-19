import React, { useMemo } from 'react';

import { AppText } from '@/components/ui/AppText';
import { ThreadlySheet, type ThreadlySheetOption } from '@/src/components/ui/ThreadlySheet';

export type AppActionSheetOption = {
  key: string;
  title: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: AppActionSheetOption[];
  onClose: () => void;
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string | null;
};

export function AppActionSheet({
  visible,
  title,
  subtitle,
  options,
  onClose,
  loading,
  emptyMessage = 'No actions available.',
  errorMessage,
}: Props) {
  const sheetOptions = useMemo<ThreadlySheetOption[]>(() => {
    if (errorMessage) {
      return [{ label: errorMessage, disabled: true, onSelect: () => undefined }];
    }
    if (loading) {
      return [{ label: 'Loading actions...', disabled: true, onSelect: () => undefined }];
    }
    if (options.length === 0) {
      return [{ label: emptyMessage, disabled: true, onSelect: () => undefined }];
    }

    return options.map((option) => ({
      label: option.description ? `${option.title}` : option.title,
      destructive: option.destructive,
      disabled: option.disabled,
      icon: (
        <AppText variant="subtitle" tone={option.destructive ? 'danger' : 'default'}>
          {option.icon ?? '+'}
        </AppText>
      ),
      onSelect: option.onPress,
    }));
  }, [emptyMessage, errorMessage, loading, options]);

  return (
    <ThreadlySheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      options={sheetOptions}
      onClose={onClose}
    />
  );
}

export default AppActionSheet;
