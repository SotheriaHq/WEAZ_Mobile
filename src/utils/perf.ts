const marks = new Map<string, number>();

import { Sentry } from '@/src/observability/sentry';

const addPerfBreadcrumb = (message: string): void => {
  try {
    Sentry.addBreadcrumb({ category: 'perf', message, level: 'info' });
  } catch {
    // Sentry optional when DSN is not configured.
  }
};

export const perfMark = (name: string): void => {
  marks.set(name, Date.now());
};

export const perfMeasure = (name: string, fromMark: string): number => {
  const start = marks.get(fromMark);
  if (start == null) return 0;

  const elapsed = Date.now() - start;

  if (__DEV__ && elapsed > 100) {
    console.warn(`[PERF] ${name}: ${elapsed}ms`);
  }

  try {
    addPerfBreadcrumb(`${name}: ${elapsed}ms`);
  } catch {
    // noop
  }

  marks.delete(fromMark);
  return elapsed;
};
