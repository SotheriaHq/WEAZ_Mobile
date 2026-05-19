import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

interface FloatingLabelInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
  icon?: string;
  value?: string;
  onChangeText?: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  placeholder?: string;
  hideLabel?: boolean;
  testID?: string;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
}

export function FloatingLabelInput({
  label,
  error,
  isPassword = false,
  icon,
  value,
  onChangeText,
  hideLabel = false,
  placeholder,
  ...rest
}: FloatingLabelInputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { theme } = useTheme();
  const hasError = Boolean(error);

  return (
    <View style={styles.container}>
      {!hideLabel ? (
        <AppText variant="caption" tone="muted" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
          },
        ]}
      >
        {icon && (
          <View style={styles.leading}>
            <AppText variant="subtitle">{icon}</AppText>
          </View>
        )}
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          placeholder={placeholder ?? (hideLabel ? label : undefined)}
          secureTextEntry={isPassword && !passwordVisible}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              paddingLeft: icon ? 44 : tokens.spacing.lg,
              paddingRight: isPassword ? 44 : tokens.spacing.lg,
              fontFamily: tokens.fontFamily.regular,
              fontSize: tokens.typography.body.size,
              lineHeight: tokens.typography.body.lineHeight,
            },
          ]}
          placeholderTextColor={theme.colors.textMuted}
        />
        {isPassword && (
          <Pressable
            style={styles.trailing}
            onPress={() => setPasswordVisible(!passwordVisible)}
            accessibilityRole="button"
          >
            <AppText variant="subtitle">{passwordVisible ? '🙈' : '👁️'}</AppText>
          </Pressable>
        )}
      </View>
      {hasError && (
        <AppText variant="caption" tone="danger" style={styles.message}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginBottom: tokens.spacing.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  field: {
    minHeight: 52,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 52,
  },
  leading: {
    position: 'absolute',
    left: tokens.spacing.lg,
    zIndex: 2,
    justifyContent: 'center',
  },
  trailing: {
    position: 'absolute',
    right: tokens.spacing.lg,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  message: {
    marginTop: tokens.spacing.xs,
  },
});

export default FloatingLabelInput;
