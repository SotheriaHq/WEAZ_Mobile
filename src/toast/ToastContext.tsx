/**
 * Toast Context - Mobile
 * Global toast notification system for the app
 * Similar to 'sonner' on web but optimized for React Native
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  actionLabel?: string;
  onPress?: () => void;
}

export type ToastOptions = number | {
  duration?: number;
  actionLabel?: string;
  onPress?: () => void;
};

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
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

  const handleBodyPress = () => {
    if (!toast.onPress) return;
    toast.onPress();
    dismissToast();
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
      <Pressable
        onPress={handleBodyPress}
        disabled={!toast.onPress}
        style={styles.toastBody}
        accessibilityRole={toast.onPress ? 'button' : undefined}
      >
        <MaterialIcons name={colors.iconName} size={20} color={colors.icon} />
        <AppText variant="bodyReadable" tone="inverse" numberOfLines={2} style={styles.toastText}>
          {toast.message}
        </AppText>
        {toast.actionLabel ? (
          <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
            {toast.actionLabel}
          </AppText>
        ) : null}
      </Pressable>
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

function normalizeToastOptions(options?: ToastOptions) {
  if (typeof options === 'number') return { duration: options };
  return options ?? {};
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((type: ToastType, message: string, options?: ToastOptions) => {
    const id = `toast-${++toastIdCounter}`;
    const normalized = normalizeToastOptions(options);
    setToasts((prev) => [...prev.slice(-2), { id, type, message, ...normalized }]); // Keep max 3 toasts
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string, options?: ToastOptions) => addToast('success', message, options), [addToast]);
  const error = useCallback((message: string, options?: ToastOptions) => addToast('error', message, options), [addToast]);
  const info = useCallback((message: string, options?: ToastOptions) => addToast('info', message, options), [addToast]);
  const warning = useCallback((message: string, options?: ToastOptions) => addToast('warning', message, options), [addToast]);

  // Memoized, and that is load-bearing rather than an optimisation.
  //
  // `ToastProvider` re-renders every time a toast appears or dismisses. A fresh
  // object literal here handed every `useToast()` consumer in the app a new
  // context value on each of those renders, which invalidated every
  // `useCallback`/`useEffect` that lists `toast` in its deps. On the brand
  // profile editor that meant `loadProfile` was rebuilt, its effect re-fired,
  // the screen flipped to the full-page loader, and the refetch overwrote
  // `form`/`baseline` — so uploading an avatar (which toasts on success) silently
  // discarded every unsaved text field. The four handlers below are already
  // stable, so this value never needs to change.
  const value = useMemo<ToastContextValue>(
    () => ({ success, error, info, warning }),
    [success, error, info, warning],
  );

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
  success: (message: string, options?: ToastOptions) => globalToastRef?.success(message, options),
  error: (message: string, options?: ToastOptions) => globalToastRef?.error(message, options),
  info: (message: string, options?: ToastOptions) => globalToastRef?.info(message, options),
  warning: (message: string, options?: ToastOptions) => globalToastRef?.warning(message, options),
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
  },
  toastBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
