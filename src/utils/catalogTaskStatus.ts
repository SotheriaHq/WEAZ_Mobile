export type CatalogTaskBucket = 'DRAFT' | 'IN_REVIEW' | 'FAILED';

/** Upload failure is an owner action, never a pending moderation decision. */
export function resolveCatalogTaskBucket(task: { status: string; action: 'draft' | 'publish' }): CatalogTaskBucket | null {
  if (task.status === 'failed') return 'FAILED';
  if (!['running', 'complete', 'publishing', 'settling'].includes(task.status)) return null;
  return task.action === 'draft' ? 'DRAFT' : 'IN_REVIEW';
}

export function latestCatalogTasks<T extends { id: string; designId?: string | null; updatedAt: number }>(tasks: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const task of tasks) {
    const key = task.designId ?? `task:${task.id}`;
    const previous = latest.get(key);
    if (!previous || task.updatedAt > previous.updatedAt) latest.set(key, task);
  }
  return Array.from(latest.values());
}

export function countCatalogTaskBucket(
  serverItems: readonly { id: string }[],
  tasks: readonly { id: string; designId?: string | null; updatedAt: number; status: string; action: 'draft' | 'publish' }[],
  bucket: CatalogTaskBucket,
): number {
  const latest = latestCatalogTasks(tasks);
  const ids = new Set(filterCatalogServerItems(serverItems, latest, bucket).map((item) => item.id));
  for (const task of latest) {
    if (resolveCatalogTaskBucket(task) === bucket) ids.add(task.designId ?? `task:${task.id}`);
  }
  return ids.size;
}

export function filterCatalogServerItems<T extends { id: string }>(
  items: readonly T[],
  tasks: readonly { id: string; designId?: string | null; updatedAt: number; status: string; action: 'draft' | 'publish' }[],
  bucket: CatalogTaskBucket,
): T[] {
  const byDesign = new Map(latestCatalogTasks(tasks).filter((task) => task.designId).map((task) => [task.designId!, task]));
  return items.filter((item) => {
    const local = byDesign.get(item.id);
    return !local || resolveCatalogTaskBucket(local) === bucket;
  });
}
