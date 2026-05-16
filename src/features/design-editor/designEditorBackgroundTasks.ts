export type DesignEditorBackgroundTaskAction = 'draft' | 'publish';
export type DesignEditorBackgroundTaskStatus = 'running' | 'complete' | 'failed';

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
  startedAt: number;
  updatedAt: number;
};

type Listener = () => void;

let tasks: DesignEditorBackgroundTask[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function readDesignEditorBackgroundTasks() {
  return tasks;
}

export function subscribeDesignEditorBackgroundTasks(listener: Listener) {
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
    return {
      ...task,
      ...update,
      progress: update.progress === undefined ? task.progress : normalizeProgress(update.progress),
      updatedAt: Date.now(),
    };
  });
  if (changed) emit();
}

export function removeDesignEditorBackgroundTask(id: string) {
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return;
  tasks = next;
  emit();
}
