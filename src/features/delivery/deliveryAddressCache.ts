import { ProfileApi, type SavedDeliveryAddress } from '@/src/api/ProfileApi';

/**
 * The delivery book and the profile location, loaded with the session.
 *
 * Bag it used to fetch the book when its sheet opened, show "Loading your
 * addresses…", and then dismiss itself as that row was replaced. The address
 * is already on the account by then. This cache is filled as soon as the
 * person is signed in, so the sheet paints the saved address — or the empty
 * fields, filled from the profile — on the first frame.
 */

export type ProfileAddressSeed = {
  street: string;
  city: string;
  state: string;
  country: string;
};

export type DeliveryAddressSnapshot = {
  /** `null` until the first read settles. An empty list means there is no saved address. */
  book: SavedDeliveryAddress[] | null;
  profile: ProfileAddressSeed | null;
};

const EMPTY_SNAPSHOT: DeliveryAddressSnapshot = { book: null, profile: null };

let snapshot: DeliveryAddressSnapshot = EMPTY_SNAPSHOT;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: DeliveryAddressSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getDeliveryAddressSnapshot(): DeliveryAddressSnapshot {
  return snapshot;
}

export function subscribeDeliveryAddressCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function rememberDeliveryAddresses(book: SavedDeliveryAddress[]) {
  publish({ book, profile: snapshot.profile });
}

export function clearDeliveryAddressCache() {
  inflight = null;
  publish(EMPTY_SNAPSHOT);
}

/** One shared read. Later callers join the request already in flight. */
export function warmDeliveryAddressCache(): Promise<void> {
  if (snapshot.book && inflight == null) return Promise.resolve();
  if (inflight) return inflight;

  inflight = (async () => {
    const [bookResult, profileResult] = await Promise.allSettled([
      ProfileApi.getDeliveryAddresses(),
      ProfileApi.getMe(),
    ]);

    const book = bookResult.status === 'fulfilled' ? bookResult.value : snapshot.book;
    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    publish({
      book,
      profile: profile
        ? {
            street: profile.address?.trim() ?? '',
            city: profile.city?.trim() ?? '',
            state: profile.state?.trim() ?? '',
            country: profile.country?.trim() ?? '',
          }
        : snapshot.profile,
    });
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
