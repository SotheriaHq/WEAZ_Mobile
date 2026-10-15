import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Which garment's size the PROFILE shows.
 *
 * The profile used to render every category it could compute — Tops, Bottoms,
 * Dresses, Shirts, Jackets — plus a progress bar, plus eight measurements,
 * plus a region switcher. That is the fittings screen's job. The profile needs
 * to answer one question at a glance ("what size am I?"), and the shopper is
 * the only one who knows which garment that means for them.
 *
 * Stored on the DEVICE rather than the account, deliberately: this is a display
 * choice about one screen, not identity or sizing data, and nothing else — no
 * brand, no order, no recommendation — reads it. Keeping it local avoids a
 * schema change and a round trip for something that must be instant.
 *
 * `null` means "not chosen yet", which the UI resolves to the first available
 * category rather than showing nothing.
 */
const STORAGE_KEY = 'wiez.profile.sizeCategory.v1';

let cached: string | null = null;
let loaded = false;
const listeners = new Set<(value: string | null) => void>();

async function load(): Promise<string | null> {
  if (loaded) return cached;
  try {
    cached = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

export async function setProfileSizeCategory(category: string | null): Promise<void> {
  cached = category;
  loaded = true;
  // Notify before persisting: the UI should track the tap, not the disk.
  listeners.forEach((listener) => listener(category));
  try {
    if (category) await AsyncStorage.setItem(STORAGE_KEY, category);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // A display preference is not worth surfacing a failure for; it simply
    // falls back to the first available category next launch.
  }
}

/**
 * Read the preference, and stay in step when it changes elsewhere.
 *
 * The subscription matters because the fittings screen and the profile card
 * are mounted at the same time — the profile is the screen underneath. Without
 * it, changing the preference would not be visible until the profile remounted.
 */
export function useProfileSizeCategory(): {
  category: string | null;
  ready: boolean;
  setCategory: (next: string | null) => void;
} {
  const [category, setCategoryState] = useState<string | null>(cached);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    let active = true;
    void load().then((value) => {
      if (!active) return;
      setCategoryState(value);
      setReady(true);
    });

    const listener = (value: string | null) => setCategoryState(value);
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  const setCategory = useCallback((next: string | null) => {
    void setProfileSizeCategory(next);
  }, []);

  return { category, ready, setCategory };
}

/**
 * The category the profile should display.
 *
 * Falls back to the first computed category so a shopper who has never opened
 * the fittings screen still sees a size, and falls back again if the chosen
 * category stops being computable (measurements removed, chart withdrawn).
 */
export function resolveDisplayCategory(
  preferred: string | null,
  available: Array<{ category: string }>,
): string | null {
  if (available.length === 0) return null;
  if (preferred && available.some((entry) => entry.category === preferred)) {
    return preferred;
  }
  return available[0].category;
}
