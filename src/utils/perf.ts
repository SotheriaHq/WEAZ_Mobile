const marks = new Map<string, number>();

const addPerfBreadcrumb = (_message: string): void => {
  // noop: @sentry/react-native is not installed in this app.
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
