export interface ProfilePhotoViewState {
  ownerId: string;
  profilePhotoUpdatedAt: string | null;
  viewed: boolean;
  hasUnviewedUpdate: boolean;
  canMarkViewed: boolean;
}

export const createNeutralProfilePhotoViewState = (
  ownerId: string,
): ProfilePhotoViewState => ({
  ownerId,
  profilePhotoUpdatedAt: null,
  viewed: true,
  hasUnviewedUpdate: false,
  canMarkViewed: false,
});

export const createUnviewedProfilePhotoViewState = (
  ownerId: string,
  profilePhotoUpdatedAt: string,
): ProfilePhotoViewState => ({
  ownerId,
  profilePhotoUpdatedAt,
  viewed: false,
  hasUnviewedUpdate: true,
  canMarkViewed: true,
});
