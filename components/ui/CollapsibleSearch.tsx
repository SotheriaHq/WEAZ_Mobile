import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapseOnBlurWhenEmpty?: boolean;
  iconButtonVariant?: 'surface' | 'bare';
  showInputLeadingIcon?: boolean;
};

export function CollapsibleSearch({
  label,
  value,
  onChangeText,
  placeholder = 'Search',
  containerStyle,
  inputContainerStyle,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  collapseOnBlurWhenEmpty = true,
  iconButtonVariant = 'surface',
  showInputLeadingIcon = true,
  onBlur,
  ...textInputProps
}: Props) {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? internalExpanded;
  const hasQuery = value.trim().length > 0;

  const setExpanded = useCallback(
    (nextExpanded: boolean) => {
      if (expanded === undefined) {
        setInternalExpanded(nextExpanded);
      }
      onExpandedChange?.(nextExpanded);
    },
    [expanded, onExpandedChange],
  );

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const expandAndFocus = useCallback(() => {
    setExpanded(true);
    focusInput();
  }, [focusInput, setExpanded]);

  const collapse = useCallback(() => {
    Keyboard.dismiss();
    setExpanded(false);
  }, [setExpanded]);

  const handleIconPress = useCallback(() => {
    if (!isExpanded) {
      expandAndFocus();
      return;
    }

    if (hasQuery) {
      onChangeText('');
      focusInput();
      return;
    }

    collapse();
  }, [collapse, expandAndFocus, focusInput, hasQuery, isExpanded, onChangeText]);

  const trailing = useMemo(
    () => (
      <Pressable
        onPress={handleIconPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={hasQuery ? 'Clear search' : 'Collapse search'}
      >
        <AppText variant="subtitle">{hasQuery ? String.fromCodePoint(0x2715) : String.fromCodePoint(0x1f50d)}</AppText>
      </Pressable>
    ),
    [handleIconPress, hasQuery],
  );

  useEffect(() => {
    if (isExpanded) {
      focusInput();
    }
  }, [focusInput, isExpanded]);

  if (!isExpanded) {
    const bareIcon = iconButtonVariant === 'bare';
    return (
      <View style={[styles.root, containerStyle]}>
        <Pressable
          onPress={handleIconPress}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: bareIcon ? 'transparent' : theme.colors.surface,
              borderColor: bareIcon ? 'transparent' : theme.colors.border,
              opacity: pressed ? 0.82 : 1,
            },
            bareIcon ? styles.bareIconButton : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <AppText variant="subtitle">{String.fromCodePoint(0x1f50d)}</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.expandedRoot, containerStyle]}>
      <Input
        ref={inputRef}
        label={label}
        hideLabel
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={[styles.input, inputContainerStyle]}
        leading={showInputLeadingIcon ? <AppText variant="subtitle">{String.fromCodePoint(0x1f50d)}</AppText> : undefined}
        trailing={trailing}
        onBlur={(event) => {
          onBlur?.(event);
          if (collapseOnBlurWhenEmpty && value.trim().length === 0) {
            setExpanded(false);
          }
        }}
        {...textInputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
  },
  expandedRoot: {
    minWidth: 0,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bareIconButton: {
    borderWidth: 0,
  },
  input: {
    width: '100%',
  },
});

export default CollapsibleSearch;
