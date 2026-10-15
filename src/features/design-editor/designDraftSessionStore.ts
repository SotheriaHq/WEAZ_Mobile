import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers this device's draft-editing session token across editor mounts.
 *
 * The token used to live only in `DesignEditorProvider` state, and the editor
 * is mounted by a route — so backing out of a draft and opening it again, or
 * any reroute that unmounts the create-design layout, threw the token away.
 * The next mount asked the server for a session with no `existingToken`, the
 * server found the session this same phone had opened a minute earlier, and
 * answered "conflict" — the owner was told their own draft belonged to another
 * device, on the device that owned it, and could not save or publish.
 *
 * Persisting it means the ordinary back-and-forth reuses the session it
 * already holds instead of racing itself for it.
 *
 * Keyed by owner as well as design: these are private per account and must not
 * survive into the next user on a shared handset, so the prefix is swept by
 * `clearMobilePrivateAsyncStorage` on logout.
 */
export const DESIGN_DRAFT_SESSION_STORAGE_PREFIX = 'wiez.private.designDraftSession.';
const KEY_PREFIX = DESIGN_DRAFT_SESSION_STORAGE_PREFIX;

function storageKey(ownerUserId: string, designId: string) {
  return `${KEY_PREFIX}${ownerUserId}.${designId}`;
}

export async function readDraftSessionToken(
  ownerUserId?: string | null,
  designId?: string | null,
): Promise<string | undefined> {
  if (!ownerUserId || !designId) return undefined;
  try {
    const value = await AsyncStorage.getItem(storageKey(ownerUserId, designId));
    return value?.trim() || undefined;
  } catch {
    // A missing token only costs a take-over prompt; never fail the editor for it.
    return undefined;
  }
}

export async function writeDraftSessionToken(
  ownerUserId: string | null | undefined,
  designId: string | null | undefined,
  sessionToken: string | null | undefined,
): Promise<void> {
  if (!ownerUserId || !designId) return;
  try {
    if (!sessionToken) {
      await AsyncStorage.removeItem(storageKey(ownerUserId, designId));
      return;
    }
    await AsyncStorage.setItem(storageKey(ownerUserId, designId), sessionToken);
  } catch {
    // Non-fatal: the editor still works, it just cannot resume its session.
  }
}

export async function clearDraftSessionToken(
  ownerUserId?: string | null,
  designId?: string | null,
): Promise<void> {
  await writeDraftSessionToken(ownerUserId, designId, null);
}
