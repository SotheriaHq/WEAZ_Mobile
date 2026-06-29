import { useEffect, useMemo, useRef, useState } from 'react';

type FrameBatchedItemsOptions = {
  enabled?: boolean;
  initialCount?: number;
  batchCount?: number;
  resetKey?: string | number | null;
};

const DEFAULT_INITIAL_COUNT = 6;
const DEFAULT_BATCH_COUNT = 8;

export function useFrameBatchedItems<T>(
  items: readonly T[],
  options: FrameBatchedItemsOptions = {},
): T[] {
  const enabled = options.enabled ?? true;
  const initialCount = Math.max(1, Math.floor(options.initialCount ?? DEFAULT_INITIAL_COUNT));
  const batchCount = Math.max(1, Math.floor(options.batchCount ?? DEFAULT_BATCH_COUNT));
  const targetInitialCount = enabled ? Math.min(items.length, initialCount) : 0;
  const [visibleCount, setVisibleCount] = useState(targetInitialCount);
  const resetKeyRef = useRef(options.resetKey ?? null);

  useEffect(() => {
    const resetKey = options.resetKey ?? null;
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setVisibleCount(targetInitialCount);
      return;
    }

    setVisibleCount((current) => {
      if (!enabled) return 0;
      const minimum = targetInitialCount;
      return Math.min(items.length, Math.max(current, minimum));
    });
  }, [enabled, items.length, options.resetKey, targetInitialCount]);

  useEffect(() => {
    if (!enabled || visibleCount >= items.length) return;
    const frame = requestAnimationFrame(() => {
      setVisibleCount((current) => Math.min(items.length, current + batchCount));
    });
    return () => cancelAnimationFrame(frame);
  }, [batchCount, enabled, items.length, visibleCount]);

  return useMemo(() => {
    if (!enabled || items.length === 0) return [];
    return items.slice(0, visibleCount) as T[];
  }, [enabled, items, visibleCount]);
}
