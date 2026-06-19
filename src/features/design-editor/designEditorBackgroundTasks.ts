import AsyncStorage from '@react-native-async-storage/async-storage';

export type DesignEditorBackgroundTaskAction = 'draft' | 'publish';
export type DesignEditorBackgroundTaskStatus = 'running' | 'complete' | 'failed';

export const DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY = 'threadly.designEditor.backgroundTasks.v1';
export const DESIGN_EDITOR_FAILED_TASK_TTL_MS = 24 * 60 * 60 * 1000;

export type DesignEditorBackgroundTask = {
  id: string;
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
};

type Listener = () => void;

let tasks: DesignEditorBackgroundTask[] = [];
const listeners = new Set<Listener>();
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function pruneExpiredFailedTasks(input: DesignEditorBackgroundTask[]) {
  const now = Date.now();
  return input.filter((task) => task.status !== 'failed' || !task.expiresAt || task.expiresAt > now);
}

function persistTasks() {
  void AsyncStorage.setItem(
    DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY,
    JSON.stringify(pruneExpiredFailedTasks(tasks)),
  ).catch(() => undefined);
}

async function hydrateTasks() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    tasks = pruneExpiredFailedTasks(parsed).slice(0, 8);
    emit();
    persistTasks();
  } catch {
    // Background task persistence should never block catalog rendering.
  }
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function readDesignEditorBackgroundTasks() {
  void hydrateTasks();
  const next = pruneExpiredFailedTasks(tasks);
  if (next.length !== tasks.length) {
    tasks = next;
    persistTasks();
  }
  return tasks;
}

export function subscribeDesignEditorBackgroundTasks(listener: Listener) {
  void hydrateTasks();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createDesignEditorBackgroundTask(
  input: Pick<DesignEditorBackgroundTask, 'action' | 'title' | 'visibility'> &
    Partial<Pick<DesignEditorBackgroundTask, 'previewUri' | 'designId' | 'message'>>,
) {
  const now = Date.now();
  const task: DesignEditorBackgroundTask = {
    id: `design_task_${now}_${Math.random().toString(36).slice(2, 8)}`,
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
  };
  tasks = [task, ...tasks].slice(0, 8);
  emit();
  persistTasks();
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
    persistTasks();
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
    persistTasks();
  }
}

export function removeDesignEditorBackgroundTask(id: string) {
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return;
  tasks = next;
  emit();
  persistTasks();
}

export function clearDesignEditorBackgroundTasks() {
  tasks = [];
  emit();
  void AsyncStorage.removeItem(DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY).catch(() => undefined);
}
