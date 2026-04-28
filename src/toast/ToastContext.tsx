/**
 * Toast Context - Mobile
 * Global toast notification system for the app
 * Similar to 'sonner' on web but optimized for React Native
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
// Toast Component
// ─────────────────────────────────────────────────────────────

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string; iconName: keyof typeof MaterialIcons.glyphMap }> = {
  success: { bg: 'rgba(16, 185, 129, 0.95)', border: '#10B981', icon: '#fff', iconName: 'check-circle' },
  error: { bg: 'rgba(239, 68, 68, 0.95)', border: '#EF4444', icon: '#fff', iconName: 'error' },
  info: { bg: 'rgba(59, 130, 246, 0.95)', border: '#3B82F6', icon: '#fff', iconName: 'info' },
  warning: { bg: 'rgba(245, 158, 11, 0.95)', border: '#F59E0B', icon: '#fff', iconName: 'warning' },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const colors = TOAST_COLORS[toast.type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 15,
        stiffness: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      dismissToast();
    }, toast.duration ?? 3000);

    return () => clearTimeout(timer);
  }, []);

  const dismissToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss(toast.id);
    });
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <MaterialIcons name={colors.iconName} size={20} color={colors.icon} />
      <AppText style={styles.toastText} numberOfLines={2}>
        {toast.message}
      </AppText>
      <Pressable onPress={dismissToast} hitSlop={8}>
        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast Container
// ─────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast Provider
// ─────────────────────────────────────────────────────────────

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    setToasts((prev) => [...prev.slice(-2), { id, type, message, duration }]); // Keep max 3 toasts
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string, duration?: number) => addToast('success', message, duration), [addToast]);
  const error = useCallback((message: string, duration?: number) => addToast('error', message, duration), [addToast]);
  const info = useCallback((message: string, duration?: number) => addToast('info', message, duration), [addToast]);
  const warning = useCallback((message: string, duration?: number) => addToast('warning', message, duration), [addToast]);

  const value: ToastContextValue = { success, error, info, warning };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Return no-op functions if used outside provider (for safety)
    return {
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────
// Global toast helper (for non-component contexts like API)
// ─────────────────────────────────────────────────────────────

let globalToastRef: ToastContextValue | null = null;

export function setGlobalToastRef(ref: ToastContextValue) {
  globalToastRef = ref;
}

export const toast = {
  success: (message: string, duration?: number) => globalToastRef?.success(message, duration),
  error: (message: string, duration?: number) => globalToastRef?.error(message, duration),
  info: (message: string, duration?: number) => globalToastRef?.info(message, duration),
  warning: (message: string, duration?: number) => globalToastRef?.warning(message, duration),
};

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
