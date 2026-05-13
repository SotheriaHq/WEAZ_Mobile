import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, type View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { BrandProfileHeader, type BrandHeaderStat } from '@/components/catalog/BrandProfileHeader';
import type { ProfileBadgeModel } from '@/components/catalog/ProfileBadge';
import { brandApi, type BrandProfileDto } from '@/src/api/BrandApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useToast } from '@/src/toast/ToastContext';
import { resolveBannerImageSource, resolveProfileImageSource } from '@/src/utils/profileImage';

type OwnerCatalogMediaHeaderProps = {
  profile: BrandProfileDto | null;
  isLoading?: boolean;
  onEditProfile?: () => void;
  onCreate?: () => void;
  createAnchorRef?: React.RefObject<View | null>;
  onCreateAnchorLayout?: () => void;
  onShare?: () => void;
  onEmailPress?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  onViewAvatar?: () => void;
  stats?: BrandHeaderStat[];
  badges?: ProfileBadgeModel[];
};

type PendingMediaState = {
  src: string;
  fileId?: string | null;
};

const requestPhotoPermission = async (message: string) => {
  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissionResult.granted) {
    Alert.alert('Permission needed', message);
    return false;
  }

  return true;
};

export const OwnerCatalogMediaHeader = React.memo(function OwnerCatalogMediaHeader({
  profile,
  isLoading = false,
  onEditProfile,
  onCreate,
  createAnchorRef,
  onCreateAnchorLayout,
  onShare,
  onEmailPress,
  onBack,
  onSearch,
  onViewAvatar,
  stats = [],
  badges = [],
}: OwnerCatalogMediaHeaderProps) {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<PendingMediaState | null>(null);
  const [pendingBanner, setPendingBanner] = useState<PendingMediaState | null>(null);

  useEffect(() => {
    setPendingAvatar(null);
    setPendingBanner(null);
    setAvatarLoading(false);
    setBannerLoading(false);
  }, [profile?.id]);

  const baseAvatar = useMemo(
    () =>
      resolveProfileImageSource({
        profileImage: profile?.profileImage ?? profile?.logoImage ?? user?.profileImage ?? null,
        profileImageId: profile?.profileImageId ?? profile?.logoImageId ?? user?.profileImageId ?? null,
        profileImageFile: profile?.profileImageFile ?? profile?.logoImageMeta ?? user?.profileImageFile ?? null,
        logoImage: profile?.logoImage ?? null,
        logoImageId: profile?.logoImageId ?? null,
        logoImageMeta: profile?.logoImageMeta ?? null,
        avatarUrl: profile?.logoImage ?? profile?.profileImage ?? user?.profileImage ?? null,
      }),
    [profile, user],
  );

  const avatarUri = useResolvedImageUri({
    src: pendingAvatar?.src ?? baseAvatar.src,
    fileId: pendingAvatar?.fileId ?? baseAvatar.fileId,
  });

  const baseBanner = useMemo(
    () =>
      resolveBannerImageSource({
        bannerImage: profile?.bannerImage ?? user?.bannerImage ?? null,
        bannerImageId: profile?.bannerImageId ?? user?.bannerImageId ?? null,
        bannerImageFile: profile?.bannerImageMeta ?? user?.bannerImageFile ?? null,
      }),
    [profile?.bannerImage, profile?.bannerImageId, profile?.bannerImageMeta, user?.bannerImage, user?.bannerImageFile, user?.bannerImageId],
  );

  const bannerUri = useResolvedImageUri({
    src: pendingBanner?.src ?? baseBanner.src,
    fileId: pendingBanner?.fileId ?? baseBanner.fileId,
  });

  const brandName = profile?.brandFullName || user?.brandFullName || 'Your Brand';
  const username = profile?.username || user?.username || undefined;
  const location =
    profile?.location ||
    [profile?.brandCity, profile?.brandState, profile?.brandCountry].filter(Boolean).join(', ') || undefined;

  const handleEditAvatar = useCallback(async () => {
    const hasPermission = await requestPhotoPermission(
      'Allow access to your photos to update your profile photo.',
    );
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setAvatarLoading(true);

      const uploaded = await brandApi.uploadAvatar(asset.uri, asset.mimeType || 'image/jpeg');
      if (!uploaded) {
        throw new Error('Avatar upload did not return a file.');
      }

      setPendingAvatar({ src: uploaded.url, fileId: uploaded.id });
      updateUser({
        profileImage: uploaded.url,
        profileImageId: uploaded.id,
        profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
      });
      toast.success('Profile photo updated');
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error('Failed to upload avatar. Please try again.');
    } finally {
      setAvatarLoading(false);
    }
  }, [toast, updateUser]);

  const handleEditBanner = useCallback(async () => {
    const hasPermission = await requestPhotoPermission(
      'Allow access to your photos to update your banner image.',
    );
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setBannerLoading(true);

      const uploaded = await brandApi.uploadBanner(asset.uri, asset.mimeType || 'image/jpeg');
      if (!uploaded) {
        throw new Error('Banner upload did not return a file.');
      }

      setPendingBanner({ src: uploaded.url, fileId: uploaded.id });
      updateUser({
        bannerImage: uploaded.url,
        bannerImageId: uploaded.id,
        bannerImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
      });
      toast.success('Banner image updated');
    } catch (error) {
      console.error('Banner upload error:', error);
      toast.error('Failed to upload banner. Please try again.');
    } finally {
      setBannerLoading(false);
    }
  }, [toast, updateUser]);

  return (
    <BrandProfileHeader
      brandName={brandName}
      username={username}
      location={location}
      email={profile?.email ?? user?.email ?? null}
      description={profile?.brandDescription ?? null}
      tags={profile?.brandTags || []}
      stats={stats}
      badges={badges}
      avatarUrl={avatarUri ?? undefined}
      avatarFileId={pendingAvatar?.fileId ?? baseAvatar.fileId ?? undefined}
      bannerUrl={bannerUri ?? undefined}
      bannerFileId={pendingBanner?.fileId ?? baseBanner.fileId ?? undefined}
      isOwner
      isLoading={isLoading}
      avatarLoading={avatarLoading}
      bannerLoading={bannerLoading}
      onEditAvatar={handleEditAvatar}
      onEditBanner={handleEditBanner}
      onEditProfile={onEditProfile}
      onCreate={onCreate}
      createAnchorRef={createAnchorRef}
      onCreateAnchorLayout={onCreateAnchorLayout}
      onShare={onShare}
      onEmailPress={onEmailPress}
      onBack={onBack}
      onSearch={onSearch}
      onViewAvatar={onViewAvatar}
    />
  );
});

export default OwnerCatalogMediaHeader;
