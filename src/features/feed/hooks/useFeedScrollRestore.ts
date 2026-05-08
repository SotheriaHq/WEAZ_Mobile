import { useCallback, useRef } from 'react';
import type { FlatList } from 'react-native';
import type React from 'react';

export function useFeedScrollRestore<T>() {
  const activeIndexRef = useRef(0);

  const rememberIndex = useCallback((index: number) => {
    activeIndexRef.current = Math.max(0, index);
  }, []);

  const restoreIndex = useCallback((listRef: React.RefObject<FlatList<T> | null>, itemCount: number) => {
    if (itemCount <= 0) return;
    const index = Math.max(0, Math.min(activeIndexRef.current, itemCount - 1));
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
  }, []);

  return { activeIndexRef, rememberIndex, restoreIndex };
}
