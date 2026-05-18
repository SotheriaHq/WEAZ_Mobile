export const NEW_DROP_WINDOW_HOURS = 72;
export const NEW_DROP_BADGE_RULE = `created_at_within_${NEW_DROP_WINDOW_HOURS}h`;

export type NewDropInfo = {
  isNewDrop: boolean;
  ageHours: number | null;
};

export function getNewDropInfo(createdAt?: string | null, nowMs = Date.now()): NewDropInfo {
  if (!createdAt) return { isNewDrop: false, ageHours: null };

  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return { isNewDrop: false, ageHours: null };

  const ageHours = Math.max(0, (nowMs - createdAtMs) / 3600000);
  return {
    isNewDrop: ageHours <= NEW_DROP_WINDOW_HOURS,
    ageHours,
  };
}
