import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tells a FRESH launch link apart from Android replaying an old one.
 *
 * When Android kills a backgrounded app and the person returns from Recents, it
 * recreates the task with the Intent that ORIGINALLY started it. An app that was
 * cold-started by a link — the email-verification link is the common one —
 * therefore gets that same link back from `Linking.getInitialURL()` every time
 * it is revived afterwards. Handling it again yanks the person to a screen they
 * finished long ago (and re-spends a single-use token) instead of returning them
 * to where they were.
 *
 * Only launch (cold-start) URLs are recorded: a link that arrives while the app
 * is running is delivered through `onNewIntent` and never becomes the task's
 * root Intent, so it can never be replayed.
 *
 * A replay is "the same URL, recorded by a DIFFERENT JS runtime, recently". The
 * runtime check keeps the several consumers of one cold start (Expo Router's
 * native intent hook, the notification router, the auth link gate) from
 * mistaking each other's record for a replay.
 *
 * Stores a hash, never the URL: auth links carry single-use tokens.
 */
const LEDGER_KEY = 'wiez.launch-link.ledger.v1';
const REPLAY_WINDOW_MS = 12 * 60 * 60 * 1000;
const RUNTIME_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type LedgerEntry = { hash: string; at: number; runtimeId: string };

function hashUrl(url: string): string {
  let hash = 5381;
  for (let index = 0; index < url.length; index += 1) {
    hash = (hash * 33) ^ url.charCodeAt(index);
  }
  return `${(hash >>> 0).toString(36)}:${url.length}`;
}

async function readEntry(): Promise<LedgerEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LedgerEntry>;
    return typeof parsed.hash === 'string' && typeof parsed.at === 'number' && typeof parsed.runtimeId === 'string'
      ? (parsed as LedgerEntry)
      : null;
  } catch {
    return null;
  }
}

export async function isReplayedLaunchUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  const entry = await readEntry();
  if (!entry) return false;
  return (
    entry.hash === hashUrl(url) &&
    entry.runtimeId !== RUNTIME_ID &&
    Date.now() - entry.at < REPLAY_WINDOW_MS
  );
}

/** Record the URL this cold start was launched with. Call only for launch URLs. */
export async function markLaunchUrlHandled(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const entry: LedgerEntry = { hash: hashUrl(url), at: Date.now(), runtimeId: RUNTIME_ID };
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(entry));
  } catch {
    // Losing the record only means a later replay is handled as a fresh link.
  }
}

/**
 * Not a destination: the bare app root (Expo Router substitutes it on every
 * plain launch) or a development client's bootstrap URL. Recording these would
 * overwrite the real launch link the ledger exists to remember.
 */
export function isNonDestinationUrl(url: string): boolean {
  if (url.includes('expo-development-client')) return true;
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/+/, '');
  return rest === '' || rest.startsWith('?') || rest.startsWith('#');
}

/**
 * The launch URL this runtime should act on: `null` when there is none, or when
 * it is Android replaying the link an earlier runtime was started with. A fresh
 * URL is recorded as a side effect. Non-destination URLs pass through untouched.
 */
export async function claimFreshLaunchUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (isNonDestinationUrl(url)) return url;
  if (await isReplayedLaunchUrl(url)) return null;
  await markLaunchUrlHandled(url);
  return url;
}
