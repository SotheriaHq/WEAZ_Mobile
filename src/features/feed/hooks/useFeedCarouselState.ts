import { useCallback, useRef, useState } from 'react';

export function useFeedCarouselState() {
  const stateRef = useRef(new Map<string, number>());
  const [, bumpVersion] = useState(0);

  const getIndex = useCallback((key: string) => stateRef.current.get(key) ?? 0, []);

  const setIndex = useCallback((key: string, index: number) => {
    stateRef.current.set(key, index);
    bumpVersion((current) => current + 1);
  }, []);

  const clear = useCallback(() => {
    stateRef.current.clear();
    bumpVersion((current) => current + 1);
  }, []);

  return { getIndex, setIndex, clear };
}
