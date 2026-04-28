import { getAvatarFallback, resolveProfileImageSource, type ProfileImageSource } from '@/src/utils/profileImage';

export type IdentitySource = ProfileImageSource & {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  brandFullName?: string | null;
  brandName?: string | null;
  title?: string | null;
  location?: string | null;
  address?: string | null;
  createdAt?: string | null;
};

export type ResolvedIdentity = {
  displayName: string;
  handle: string | null;
  initials: string;
  avatarSrc: string | null;
  avatarFileId: string | null;
  locationLabel: string | null;
  joinedLabel: string | null;
};

function formatJoinedLabel(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Joined ${date.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;
}

export function resolveIdentity(source?: IdentitySource | null): ResolvedIdentity {
  const fullName = [source?.firstName, source?.lastName].filter(Boolean).join(' ').trim();
  const displayName =
    fullName ||
    source?.brandFullName?.trim() ||
    source?.brandName?.trim() ||
    source?.title?.trim() ||
    source?.username?.trim() ||
    'Threadly User';
  const handle = source?.username?.trim() ? `@${source.username.trim()}` : null;
  const avatar = resolveProfileImageSource(source);

  return {
    displayName,
    handle,
    initials: getAvatarFallback(displayName, source?.username ?? null),
    avatarSrc: avatar.src,
    avatarFileId: avatar.fileId,
    locationLabel: source?.location?.trim() || source?.address?.trim() || null,
    joinedLabel: formatJoinedLabel(source?.createdAt),
  };
}
