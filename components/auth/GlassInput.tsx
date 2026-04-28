import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, TextInput, TextInputProps, View, Pressable, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

interface GlassInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightIconPress?: () => void;
  showPasswordToggle?: boolean;
}

export function GlassInput({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  showPasswordToggle,
  secureTextEntry,
  style,
  ...props
}: GlassInputProps) {
  const { theme } = useTheme();
  
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  
  const focusAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setIsFocused(true);
    
    // Focus border animation
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    // Glow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    glowAnim.stopAnimation();
    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  // Shake animation for errors
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  React.useEffect(() => {
    if (error) {
      triggerShake();
    }
  }, [error]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      theme.colors.border,
      theme.colors.focusRing,
    ],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.15, 0.25],
  });

  const actualSecureEntry = showPasswordToggle 
    ? secureTextEntry && !isPasswordVisible 
    : secureTextEntry;

  return (
    <View style={styles.container}>
      {label && (
        <AppText variant="caption" tone="secondary" style={styles.label}>
          {label}
        </AppText>
      )}
      
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            borderColor,
            backgroundColor: theme.colors.surface,
            transform: [{ translateX: shakeAnim }],
          },
          error && { borderColor: theme.colors.danger },
        ]}
      >
        {/* Glow effect */}
        {isFocused && (
          <Animated.View
            style={[
              styles.glowOverlay,
              { opacity: glowOpacity },
            ]}
          />
        )}
        
        {leftIcon && (
          <View style={styles.iconLeft}>
            <MaterialIcons 
              name={leftIcon} 
              size={20} 
              color={isFocused ? theme.colors.primary : theme.colors.textMuted} 
            />
          </View>
        )}
        
        <TextInput
          {...props}
          secureTextEntry={actualSecureEntry}
          style={[
            styles.input,
            { color: theme.colors.text },
            leftIcon && styles.inputWithLeftIcon,
            (rightIcon || showPasswordToggle) && styles.inputWithRightIcon,
            style,
          ]}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={(e) => {
            handleFocus();
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            handleBlur();
            props.onBlur?.(e);
          }}
        />
        
        {showPasswordToggle && (
          <Pressable 
            style={styles.iconRight} 
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons 
              name={isPasswordVisible ? 'visibility-off' : 'visibility'} 
              size={20} 
              color={theme.colors.textMuted} 
            />
          </Pressable>
        )}
        
        {rightIcon && !showPasswordToggle && (
          <Pressable 
            style={styles.iconRight} 
            onPress={onRightIconPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons 
              name={rightIcon} 
              size={20} 
              color={theme.colors.textMuted} 
            />
          </Pressable>
        )}
      </Animated.View>
      
      {error && (
        <Animated.Text 
          style={[
            styles.errorText,
            {
              color: theme.colors.danger,
              fontFamily: tokens.fontFamily.medium,
              fontSize: tokens.typography.caption.size,
              lineHeight: tokens.typography.caption.lineHeight,
              transform: [{ translateX: shakeAnim }],
            },
          ]}
        >
          {error}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 16,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    fontFamily: tokens.fontFamily.medium,
    fontSize: tokens.typography.body.size,
    lineHeight: tokens.typography.body.lineHeight,
  },
  inputWithLeftIcon: {
    paddingLeft: 48,
  },
  inputWithRightIcon: {
    paddingRight: 48,
  },
  iconLeft: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  iconRight: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
  },
  errorText: {
    marginTop: 6,
    marginLeft: 2,
  },
});
