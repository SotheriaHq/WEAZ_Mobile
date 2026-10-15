/**
 * feedMixer — scored rotation for market/feed lists (mobile parity of the
 * web + backend feed ranking rules).
 *
 * WHY: default recency ordering renders the exact same stack on every visit.
 * Product rule: content must be MIXED on every login / refresh / re-entry
 * while still favouring fresh + engaging items.
 *
 * Scoring:
 *   recency    = exp(-ageDays / 5)          // half-life ≈ 3.5 days
 *   engagement = log1p(popularity) / 8      // log-scaled, capped at 1
 *   score      = 0.6*recency + 0.4*engagement, floor 0.6 for < 48h old items
 *
 * Rotation: Efraimidis–Spirakis weighted sampling — sortKey = u^(1/score)
 * with u = seededUnit(seed, id). Deterministic per seed (stable while the
 * screen is mounted); a fresh seed per mount remixes the list.
 *
 * Diversity: greedy pass avoids two consecutive items from the same brand.
 */

export interface MixAccessors<T> {
  getId: (item: T) => string;
  getCreatedAtMs: (item: T) => number;
  getPopularity: (item: T) => number;
  getBrandKey: (item: T) => string | null | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_CONTENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const NEW_CONTENT_SCORE_FLOOR = 0.6;
const MIN_SAMPLING_SCORE = 0.05;

/** Deterministic 32-bit FNV-1a hash of seed+id mapped to (0, 1). */
export const seededUnit = (seed: string, itemId: string): number => {
  const input = `${seed}:${itemId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) + 0.5) / 4294967296.5;
};

export const createMixSeed = (): string =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffffff).toString(36)}`;

export const mixScoredItems = <T>(
  items: T[],
  seed: string,
  accessors: MixAccessors<T>,
  nowMs: number = Date.now(),
): T[] => {
  if (items.length <= 1) return items;

  const score = (item: T): number => {
    const createdMs = accessors.getCreatedAtMs(item);
    const ageDays = createdMs > 0 ? Math.max(0, (nowMs - createdMs) / DAY_MS) : 30;
    const recency = Math.exp(-ageDays / 5);
    const popularity = Math.max(0, accessors.getPopularity(item) || 0);
    const engagement = Math.min(1, Math.log1p(popularity) / 8);
    let value = 0.6 * recency + 0.4 * engagement;
    if (createdMs > 0 && nowMs - createdMs < NEW_CONTENT_WINDOW_MS) {
      value = Math.max(value, NEW_CONTENT_SCORE_FLOOR);
    }
    return value;
  };

  const keyed = items.map((item) => ({
    item,
    id: accessors.getId(item),
    key: 0,
  }));
  keyed.forEach((entry) => {
    entry.key =
      seededUnit(seed, entry.id) **
      (1 / Math.max(score(entry.item), MIN_SAMPLING_SCORE));
  });
  keyed.sort((a, b) => b.key - a.key || (a.id < b.id ? -1 : 1));

  const ordered = keyed.map((entry) => entry.item);
  for (let i = 1; i < ordered.length; i += 1) {
    const prevBrand = accessors.getBrandKey(ordered[i - 1]);
    if (!prevBrand || accessors.getBrandKey(ordered[i]) !== prevBrand) continue;
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (accessors.getBrandKey(ordered[j]) !== prevBrand) {
        const swap = ordered[i];
        ordered[i] = ordered[j];
        ordered[j] = swap;
        break;
      }
    }
  }
  return ordered;
};
