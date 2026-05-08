import { useCallback, useRef, useState } from 'react';

export function useVisibleFeedItem(initialIndex = 0) {
  const activeIndexRef = useRef(initialIndex);
  const [activeIndex, setActiveIndexState] = useState(initialIndex);

  const setActiveIndex = useCallback((nextIndex: number) => {
    activeIndexRef.current = nextIndex;
    setActiveIndexState(nextIndex);
  }, []);

  return { activeIndex, activeIndexRef, setActiveIndex };
}
