import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DesignEditorAsset, DesignFilterSelection } from '@/src/api/DesignApi';

export type DesignEditorBackgroundTaskAction = 'draft' | 'publish';
export type DesignEditorBackgroundTaskStatus = 'running' | 'complete' | 'failed';

export const DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY = 'threadly.designEditor.backgroundTasks.v1';
export const DESIGN_EDITOR_FAILED_TASK_TTL_MS = 24 * 60 * 60 * 1000;

export type DesignEditorRecoverySnapshot = {
  ownerUserId: string;
  form: Record<string, unknown>;
  assets: DesignEditorAsset[];
  coverAssetId: string | null;
  filterSelection: DesignFilterSelection;
  customMeasurementKeys: string[];
  originalMediaIds: string[];
  selectedCustomOrderConfigurationId: string;
  draftSessionToken?: string;
  draftVersion?: number;
  capturedAt: number;
};

export type DesignEditorBackgroundTask = {
  id: string;
  ownerUserId: string;
  action: DesignEditorBackgroundTaskAction;
  status: DesignEditorBackgroundTaskStatus;
  title: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  previewUri?: string | null;
  designId?: string | null;
  progress: number;
  message: string;
  error?: string | null;
  expiresAt?: number | null;
  lastInteractedAt?: number | null;
  startedAt: number;
  updatedAt: number;
  recoverySnapshot?: DesignEditorRecoverySnapshot | null;
};

type Listener = () => void;

let tasks: DesignEditorBackgroundTask[] = [];
const listeners = new Set<Listener>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let storageGeneration = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function pruneExpiredFailedTasks(input: DesignEditorBackgroundTask[]) {
  const now = Date.now();
  return input.filter((task) => task.status !== 'failed' || !task.expiresAt || task.expiresAt > now);
}

function persistTasksNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const serialized = JSON.stringify(pruneExpiredFailedTasks(tasks));
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY, serialized))
    .catch(() => undefined);
}

function schedulePersistTasks() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistTasksNow, 120);
}

async function hydrateTasks() {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  const generationAtStart = storageGeneration;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      if (storageGeneration !== generationAtStart) return;
      const currentIds = new Set(tasks.map((task) => task.id));
      tasks = pruneExpiredFailedTasks([
        ...tasks,
        ...parsed.filter((task) => !currentIds.has(task?.id)),
      ]).slice(0, 8);
      emit();
      schedulePersistTasks();
    } catch {
      // Background task persistence should never block catalog rendering.
    } finally {
      hydrated = true;
      hydrationPromise = null;
    }
  })();
  return hydrationPromise;
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function readDesignEditorBackgroundTasks(ownerUserId?: string | null) {
  void hydrateTasks();
  const next = pruneExpiredFailedTasks(tasks);
  if (next.length !== tasks.length) {
    tasks = next;
    schedulePersistTasks();
  }
  if (ownerUserId === undefined) return tasks;
  if (!ownerUserId) return [];
  return tasks.filter((task) => task.ownerUserId === ownerUserId);
}

export async function readDesignEditorRecoverySnapshot(
  taskId: string,
  ownerUserId: string,
) {
  await hydrateTasks();
  const task = tasks.find(
    (entry) => entry.id === taskId && entry.ownerUserId === ownerUserId,
  );
  const snapshot = task?.recoverySnapshot;
  if (
    !snapshot ||
    snapshot.ownerUserId !== ownerUserId ||
    !snapshot.form ||
    typeof snapshot.form !== 'object' ||
    !Array.isArray(snapshot.assets)
  ) {
    return null;
  }
  return snapshot;
}

export function subscribeDesignEditorBackgroundTasks(listener: Listener) {
  void hydrateTasks();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createDesignEditorBackgroundTask(
  input: Pick<DesignEditorBackgroundTask, 'action' | 'title' | 'visibility' | 'ownerUserId'> &
    Partial<Pick<DesignEditorBackgroundTask, 'previewUri' | 'designId' | 'message' | 'recoverySnapshot'>>,
) {
  const now = Date.now();
  const task: DesignEditorBackgroundTask = {
    id: `design_task_${now}_${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId: input.ownerUserId,
    action: input.action,
    status: 'running',
    title: input.title.trim() || (input.action === 'draft' ? 'Saving draft' : 'Publishing design'),
    visibility: input.visibility,
    previewUri: input.previewUri ?? null,
    designId: input.designId ?? null,
    progress: 0,
    message: input.message ?? (input.action === 'draft' ? 'Saving draft...' : 'Going live...'),
    error: null,
    startedAt: now,
    updatedAt: now,
    recoverySnapshot: input.recoverySnapshot ?? null,
  };
  tasks = [task, ...tasks].slice(0, 8);
  emit();
  persistTasksNow();
  return task;
}

export function updateDesignEditorBackgroundTask(
  id: string,
  update: Partial<Omit<DesignEditorBackgroundTask, 'id' | 'action' | 'startedAt'>>,
) {
  let changed = false;
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    changed = true;
    const now = Date.now();
    const nextStatus = update.status ?? task.status;
    const expiresAt =
      nextStatus === 'failed'
        ? update.expiresAt ?? task.expiresAt ?? now + DESIGN_EDITOR_FAILED_TASK_TTL_MS
        : update.expiresAt ?? null;
    return {
      ...task,
      ...update,
      progress: update.progress === undefined ? task.progress : normalizeProgress(update.progress),
      expiresAt,
      lastInteractedAt:
        nextStatus === 'failed'
          ? update.lastInteractedAt ?? task.lastInteractedAt ?? now
          : update.lastInteractedAt ?? null,
      updatedAt: now,
    };
  });
  if (changed) {
    emit();
    if (
      update.status !== undefined ||
      update.designId !== undefined ||
      update.recoverySnapshot !== undefined
    ) {
      persistTasksNow();
    } else {
      schedulePersistTasks();
    }
  }
}

export function touchDesignEditorBackgroundTask(id: string) {
  const now = Date.now();
  let changed = false;
  tasks = tasks.map((task) => {
    if (task.id !== id || task.status !== 'failed') return task;
    changed = true;
    return {
      ...task,
      lastInteractedAt: now,
      expiresAt: now + DESIGN_EDITOR_FAILED_TASK_TTL_MS,
      updatedAt: now,
    };
  });
  if (changed) {
    emit();
    persistTasksNow();
  }
}

export function removeDesignEditorBackgroundTask(id: string) {
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return;
  tasks = next;
  emit();
  persistTasksNow();
}

export function clearDesignEditorBackgroundTasks() {
  storageGeneration += 1;
  tasks = [];
  emit();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => AsyncStorage.removeItem(DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY))
    .catch(() => undefined);
}
