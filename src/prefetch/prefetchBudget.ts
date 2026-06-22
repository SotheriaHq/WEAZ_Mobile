/**
 * Phase 5 prefetch budget + priority scheduler.
 *
 * This is NOT a cache layer — it only orchestrates *when* the existing prefetch
 * primitives (router.prefetch, React Query prefetch, image prefetch) are allowed
 * to run, so predictive warming can never turn into a request storm, battery
 * drain, or memory spike.
 *
 * Rules (see PHASE_5 spec §5):
 *   - Per-lane concurrency caps: route=1, query=3, media=4
 *   - Priority order: tap > visible > near > idle
 *   - Lower-priority work yields (is cancelled) when higher-priority work needs room
 *   - Every task is keyed + deduped (incl. a short post-completion TTL)
 *   - When paused (app backgrounded / active gesture / memory pressure) only
 *     user-driven `tap` work is allowed to start
 */

export type PrefetchLane = 'route' | 'query' | 'media';
export type PrefetchPriority = 'tap' | 'visible' | 'near' | 'idle';

export type PrefetchTaskInput = {
  /** Stable identity for dedupe + cancellation. */
  key: string;
  lane: PrefetchLane;
  priority?: PrefetchPriority;
  /** The actual prefetch work. Should honour `signal` where possible. */
  run: (signal: AbortSignal) => Promise<unknown>;
};

const LANE_LIMITS: Record<PrefetchLane, number> = { route: 1, query: 3, media: 4 };
const PRIORITY_RANK: Record<PrefetchPriority, number> = { tap: 0, visible: 1, near: 2, idle: 3 };
const COMPLETED_TTL_MS = 60 * 1000;

type ScheduledTask = {
  key: string;
  lane: PrefetchLane;
  priority: PrefetchPriority;
  run: (signal: AbortSignal) => Promise<unknown>;
  controller: AbortController;
};

const queues: Record<PrefetchLane, ScheduledTask[]> = { route: [], query: [], media: [] };
const active: Record<PrefetchLane, Map<string, ScheduledTask>> = {
  route: new Map(),
  query: new Map(),
  media: new Map(),
};
const tracked = new Set<string>();
const completedUntil = new Map<string, number>();

let paused = false;

function isRecentlyCompleted(key: string) {
  const until = completedUntil.get(key);
  if (!until) return false;
  if (until <= Date.now()) {
    completedUntil.delete(key);
    return false;
  }
  return true;
}

function sortQueue(lane: PrefetchLane) {
  queues[lane].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/**
 * If a lane is saturated when a higher-priority task arrives, abort the
 * lowest-priority *idle* in-flight task to make room. We only ever pre-empt
 * `idle` work — visible/near/tap work is allowed to finish.
 */
function tryYieldFor(lane: PrefetchLane, incoming: PrefetchPriority) {
  if (active[lane].size < LANE_LIMITS[lane]) return;
  if (PRIORITY_RANK[incoming] >= PRIORITY_RANK.near) return; // only tap/visible pre-empt

  let victim: ScheduledTask | null = null;
  for (const task of active[lane].values()) {
    if (task.priority === 'idle' && (!victim || PRIORITY_RANK[task.priority] > PRIORITY_RANK[victim.priority])) {
      victim = task;
    }
  }
  if (victim) {
    victim.controller.abort();
    active[lane].delete(victim.key);
    tracked.delete(victim.key);
  }
}

function pump(lane: PrefetchLane) {
  const queue = queues[lane];
  while (active[lane].size < LANE_LIMITS[lane] && queue.length > 0) {
    // When paused, only user-driven tap work may start.
    if (paused && queue[0].priority !== 'tap') break;

    const task = queue.shift()!;
    active[lane].set(task.key, task);

    void Promise.resolve()
      .then(() => task.run(task.controller.signal))
      .catch(() => undefined)
      .finally(() => {
        if (active[lane].get(task.key) === task) {
          active[lane].delete(task.key);
        }
        tracked.delete(task.key);
        completedUntil.set(task.key, Date.now() + COMPLETED_TTL_MS);
        pump(lane);
      });
  }
}

export function schedulePrefetch(input: PrefetchTaskInput): void {
  const priority = input.priority ?? 'idle';
  const { key, lane } = input;

  if (tracked.has(key) || isRecentlyCompleted(key)) return;

  const task: ScheduledTask = {
    key,
    lane,
    priority,
    run: input.run,
    controller: new AbortController(),
  };

  tracked.add(key);
  queues[lane].push(task);
  sortQueue(lane);
  tryYieldFor(lane, priority);
  pump(lane);
}

export function cancelPrefetch(key: string): void {
  for (const lane of Object.keys(queues) as PrefetchLane[]) {
    const queued = queues[lane];
    const index = queued.findIndex((task) => task.key === key);
    if (index >= 0) {
      queued[index].controller.abort();
      queued.splice(index, 1);
    }
    const running = active[lane].get(key);
    if (running) {
      running.controller.abort();
      active[lane].delete(key);
    }
  }
  tracked.delete(key);
}

/** Cancel all queued + in-flight work at or below a priority (used on navigation change). */
export function cancelPrefetchAtOrBelow(priority: PrefetchPriority): void {
  const threshold = PRIORITY_RANK[priority];
  for (const lane of Object.keys(queues) as PrefetchLane[]) {
    queues[lane] = queues[lane].filter((task) => {
      if (PRIORITY_RANK[task.priority] >= threshold) {
        task.controller.abort();
        tracked.delete(task.key);
        return false;
      }
      return true;
    });
    for (const task of [...active[lane].values()]) {
      if (PRIORITY_RANK[task.priority] >= threshold) {
        task.controller.abort();
        active[lane].delete(task.key);
        tracked.delete(task.key);
      }
    }
  }
}

/** Pause non-tap prefetching (app backgrounded, active gesture, memory pressure). */
export function setPrefetchPaused(next: boolean): void {
  paused = next;
  if (!next) {
    (Object.keys(queues) as PrefetchLane[]).forEach(pump);
  }
}

export function isPrefetchPaused(): boolean {
  return paused;
}

/** Test/diagnostic helper. */
export function __resetPrefetchBudget(): void {
  (Object.keys(queues) as PrefetchLane[]).forEach((lane) => {
    queues[lane].forEach((task) => task.controller.abort());
    active[lane].forEach((task) => task.controller.abort());
    queues[lane] = [];
    active[lane].clear();
  });
  tracked.clear();
  completedUntil.clear();
  paused = false;
}
