type InteractionTimingContext = Record<string, unknown>;

type TimingEntry = {
  name: string;
  startedAt: number;
  lastMarkAt: number;
  context: InteractionTimingContext;
};

const timingEntries = new Map<string, TimingEntry>();

const shouldLogInteractionTiming = () =>
  __DEV__ ||
  process.env.NODE_ENV === 'test' ||
  process.env.EXPO_PUBLIC_INTERACTION_TIMING === 'true';

const now = () => Date.now();

const createTimingToken = (name: string) =>
  `${name.replace(/[^a-z0-9_-]/gi, '_')}-${now()}-${Math.random().toString(36).slice(2, 8)}`;

export function startInteractionTiming(
  name: string,
  context: InteractionTimingContext = {},
) {
  const token = createTimingToken(name);
  if (!shouldLogInteractionTiming()) return token;
  const startedAt = now();
  timingEntries.set(token, {
    name,
    startedAt,
    lastMarkAt: startedAt,
    context,
  });
  console.log('[timing]', {
    event: `${name}.start`,
    token,
    ...context,
  });
  return token;
}

export function markInteractionTiming(
  token: string | null | undefined,
  mark: string,
  details: InteractionTimingContext = {},
) {
  if (!token || !shouldLogInteractionTiming()) return;
  const current = now();
  const entry = timingEntries.get(token);
  if (!entry) {
    console.log('[timing]', {
      event: mark,
      token,
      ...details,
    });
    return;
  }

  console.log('[timing]', {
    event: `${entry.name}.${mark}`,
    token,
    durationMs: current - entry.startedAt,
    sinceLastMarkMs: current - entry.lastMarkAt,
    ...entry.context,
    ...details,
  });
  timingEntries.set(token, {
    ...entry,
    lastMarkAt: current,
  });
}

export function endInteractionTiming(
  token: string | null | undefined,
  mark: string,
  details: InteractionTimingContext = {},
) {
  markInteractionTiming(token, mark, details);
  if (token && shouldLogInteractionTiming()) {
    timingEntries.delete(token);
  }
}
