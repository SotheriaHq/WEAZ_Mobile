/**
 * ProfileHeader - Mobile
 * Brand profile header with banner, avatar, info, and action buttons
 * Layout: Avatar overlays banner, info beside avatar, action buttons at far right
 */

import React, { useRef, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScrollView } from 'react-native';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ProfileHeaderProps {
  brandName: string;
  username?: string | null;
  location?: string | null;
  description?: string | null;
  tags?: string[];
  avatarUrl?: string | null;
  avatarFileId?: string;
  bannerUrl?: string | null;
  bannerFileId?: string;
  isOwner?: boolean;
  isLoading?: boolean;
  avatarLoading?: boolean;
  bannerLoading?: boolean;
  isPatched?: boolean;
  patchLoading?: boolean;
  onPatch?: () => void;
  onMessage?: () => void;
  onViewAvatar?: () => void;
  onEditAvatar?: () => void;
  onEditBanner?: () => void;
  onEditProfile?: () => void;
  onShare?: () => void;
  onBack?: () => void;
}




const BannerFallback = ({ isOwner, onEditBanner }: { isOwner: boolean; onEditBanner?: () => void }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.bannerFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
      {isOwner ? (
        <Pressable onPress={onEditBanner} style={[styles.bannerFallbackButton, { borderColor: theme.colors.border }]}>
          <AppText variant="caption" tone="muted">Edit Banner</AppText>
        </Pressable>
      ) : null}
    </View>
  );
};

const AvatarFallback = ({ initials }: { initials: string }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primary }]}>
      <AppText variant="title" tone="inverse">{initials}</AppText>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Skeleton Component
// ─────────────────────────────────────────────────────────────

const ProfileHeaderSkeleton = () => {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Skeleton width={width} height={180} borderRadius={0} />
      <View style={[styles.overlayContainer, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.mainRow}>
          <View style={[styles.avatarWrapper, { borderColor: theme.colors.bg }]}>
            <SkeletonAvatar size={84} />
          </View>
          <View style={styles.infoSection}>
            <Skeleton width={120} height={20} borderRadius={6} />
            <View style={{ height: 6 }} />
            <Skeleton width={100} height={14} borderRadius={4} />
          </View>
          <View style={styles.actionsColumn}>
            <Skeleton width={100} height={36} borderRadius={10} />
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Skeleton width={36} height={36} borderRadius={10} />
              <Skeleton width={36} height={36} borderRadius={10} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export const ProfileHeader = React.memo(function ProfileHeader({
  brandName,
  username,
  location,
  description,
  tags = [],
  avatarUrl,
  avatarFileId,
  bannerUrl,
  bannerFileId,
  isOwner = false,
  isLoading = false,
  avatarLoading = false,
  bannerLoading = false,
  isPatched = false,
  patchLoading = false,
  onPatch,
  onMessage,
  onViewAvatar,
  onEditAvatar,
  onEditBanner,
  onEditProfile,
  onShare,
  onBack,
}: ProfileHeaderProps) {
  const { width } = useWindowDimensions();
  const { scheme, theme } = useTheme();
  const isDark = scheme === 'dark';
  const [bannerFailed, setBannerFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const resolvedAvatarUrl = useResolvedImageUri({ src: avatarUrl, fileId: avatarFileId });
  const resolvedBannerUrl = useResolvedImageUri({ src: bannerUrl, fileId: bannerFileId });
  
  // Actually on mobile the backend may return signed urls or we just use avatarUrl for now
  // but adding this param matches the index shape.

  // Subtle pulse animation for loading states
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (avatarLoading || bannerLoading) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [avatarLoading, bannerLoading, pulseAnim]);

  if (isLoading) {
    return <ProfileHeaderSkeleton />;
  }

  const displayName = brandName || 'Your Brand';
  const initials = displayName.charAt(0).toUpperCase();
  const handleAvatarPress = onViewAvatar ?? (isOwner ? onEditAvatar : undefined);
  const trimmedDescription = (description ?? '').trim();

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [trimmedDescription]);

  // Text colors that work on all themes
  const brandNameColor = theme.colors.primary;
  const showBannerImage = Boolean((resolvedBannerUrl ?? bannerUrl) && !bannerFailed);
  const showAvatarImage = Boolean((resolvedAvatarUrl ?? avatarUrl) && !avatarFailed);

  return (
    <View style={styles.container}>
      {/* Banner Section */}
      <View style={styles.bannerContainer}>
        {showBannerImage ? (
          <Animated.View style={{ opacity: bannerLoading ? pulseAnim : 1, width: '100%', height: '100%' }}>
            <StableImage
              uri={resolvedBannerUrl ?? bannerUrl}
              containerStyle={styles.bannerImage}
              imageStyle={styles.bannerImage}
              onError={() => setBannerFailed(true)}
              fallback={<BannerFallback isOwner={isOwner} onEditBanner={onEditBanner} />}
            />
          </Animated.View>
        ) : (
          <BannerFallback isOwner={isOwner} onEditBanner={onEditBanner} />
        )}

        {/* Banner gradient overlay for text readability */}
        <View style={styles.bannerOverlay} />

        {/* Top Left Navigation Area (Back Arrow & Edit Banner) */}
        <View style={styles.topLeftNavContainer}>
          {onBack && (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                styles.navButtonWrapper,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityLabel="Go back"
            >
              <View style={[styles.navBlurButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <AppText style={styles.backButtonEmoji}>←</AppText>
              </View>
            </Pressable>
          )}


        </View>

        {/* QR Code - Top Right */}
        <View style={styles.qrContainer}>
          <View style={[styles.qrBox, { backgroundColor: isDark ? '#111' : '#fff' }]}>
            <AppText style={styles.qrEmoji}>▦</AppText>
          </View>
        </View>
      </View>

      {/* Profile Content - Overlapping Banner */}
      <View style={[styles.overlayContainer, { backgroundColor: theme.colors.bg }]}>
        {/* Main Row: Avatar + Info + Actions (all on same row) */}
        <View style={styles.mainRow}>
          {/* Avatar - Overlapping Banner */}
          <Pressable
            onPress={handleAvatarPress}
            onLongPress={isOwner ? onEditAvatar : undefined}
            delayLongPress={220}
            style={({ pressed }) => [
              styles.avatarWrapper,
              { borderColor: theme.colors.bg },
              pressed && isOwner && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <Animated.View style={{ opacity: avatarLoading ? pulseAnim : 1 }}>
              {showAvatarImage ? (
                <StableImage
                  uri={resolvedAvatarUrl ?? avatarUrl}
                  containerStyle={styles.avatarImage}
                  imageStyle={styles.avatarImage}
                  onError={() => setAvatarFailed(true)}
                  fallback={<AvatarFallback initials={initials} />}
                />
              ) : (
                <AvatarFallback initials={initials} />
              )}
            </Animated.View>
            
            {/* Edit avatar badge (owner only) */}
            {isOwner && (
              <View style={styles.avatarEditBadge}>
                <LinearGradient colors={['#9333EA', '#7e22ce']} style={styles.avatarEditGradient}>
                  <AppText style={styles.avatarEditEmoji}>✏️</AppText>
                </LinearGradient>
              </View>
            )}
          </Pressable>

          {/* Info - Beside Avatar */}
          <View style={styles.infoSection}>
            {/* Brand Name - Bold and visible */}
            <AppText variant="subtitle" style={styles.brandName} tone="primary" numberOfLines={1}>
              {displayName}
            </AppText>
            
            {/* Username */}
            {username && (
              <AppText variant="captionBold" style={styles.username} tone="muted" numberOfLines={1}>
                @{username}
              </AppText>
            )}

            {/* Location */}
            {location && (
              <View style={styles.locationRow}>
                <AppText variant="caption" style={styles.locationEmoji}>📍</AppText>
                <AppText variant="small" style={styles.location} tone="muted" numberOfLines={2}>
                  {location}
                </AppText>
              </View>
            )}
          </View>

          {/* Action Buttons - At far right, vertically stacked */}
          <View style={styles.actionsColumn}>
            {/* Edit & Share buttons row */}
            <View style={styles.smallButtonsRow}>
              {isOwner && (
                <Button title="Edit Profile" variant="outline" size="sm" onPress={onEditProfile} />
              )}
              <Button title="Share" variant="outline" size="sm" onPress={onShare} />
            </View>

            {/* ---------- VISITOR ACTIONS ---------- */}
            {!isOwner && (onPatch || onMessage) && (
              <View style={[styles.smallButtonsRow, { marginTop: 8 }]}>
                {onPatch && (
                  <Pressable
                    onPress={onPatch}
                    disabled={patchLoading}
                    style={({ pressed }) => [
                      styles.sleekPatchBtn,
                      isPatched
                        ? { backgroundColor: brandNameColor, shadowColor: brandNameColor }
                        : { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                      !isPatched && !isDark && { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
                      isPatched && { shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
                      pressed && { transform: [{ scale: 0.96 }] },
                      patchLoading && { opacity: 0.6 },
                    ]}
                    accessibilityLabel={isPatched ? 'Unpatch brand' : 'Patch brand'}
                  >
                    {patchLoading ? (
                      <AppText variant="captionBold" style={styles.sleekPatchBtnText} tone={isPatched ? 'inverse' : 'primary'}>...</AppText>
                    ) : (
                      <AppText
                        variant="captionBold"
                        style={styles.sleekPatchBtnText}
                        tone={isPatched ? 'inverse' : 'default'}
                      >
                        {isPatched ? '🪡 Patched' : '🪡 Patch'}
                      </AppText>
                    )}
                  </Pressable>
                )}

                {onMessage && (
                  <Pressable
                    onPress={onMessage}
                    style={({ pressed }) => [
                      styles.sleekMessageBtn,
                      { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
                      pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                    ]}
                    accessibilityLabel="Message brand"
                  >
                    <AppText style={styles.sleekMessageEmoji}>💬</AppText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Tags - Below the main row */}
        {tags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsScroll}
            contentContainerStyle={styles.tagsContainer}
          >
            {tags.map((tag) => (
              <Chip key={tag} label={`#${tag}`} selected={false} />
            ))}
          </ScrollView>
        )}
        {trimmedDescription ? (
          <View style={styles.descriptionWrap}>
            <AppText
              variant="bodyBold"
              numberOfLines={descriptionExpanded ? undefined : 3}
            >
              {trimmedDescription}
            </AppText>
            <Pressable onPress={() => setDescriptionExpanded((value) => !value)}>
              <AppText variant="smallBold" tone="primary">
                {descriptionExpanded ? 'see less' : 'see more'}
              </AppText>
            </Pressable>
          </View>
        ) : isOwner ? (
          <Pressable onPress={onEditProfile} style={styles.descriptionWrap}>
            <AppText variant="smallBold" tone="primary">
              Add a description
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  // Banner
  bannerContainer: {
    height: 180,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bannerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerFallbackButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#273244',
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  bannerPlaceholderTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bannerPlaceholderSub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 4,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    backgroundColor: 'transparent',
  },
  topLeftNavContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 8,
  },
  navButtonWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  navBlurButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 44,
    minWidth: 44,
    borderWidth: 1,
    borderRadius: 20,
  },
  backButtonEmoji: {
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '800',
  },
  editBannerText: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  qrContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  qrBox: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  qrEmoji: {
    fontSize: 30,
    lineHeight: 34,
  },

  // Overlay section - overlaps banner
  overlayContainer: {
    marginTop: -32,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // Main row: avatar, info, actions all horizontal
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Avatar - overlaps banner
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 14,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
    marginTop: -16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  avatarEditGradient: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditEmoji: {
    fontSize: 12,
  },

  // Info section - beside avatar, takes remaining space
  infoSection: {
    flex: 1,
    paddingTop: 0,
    gap: 2,
    minWidth: 0,
  },
  brandName: {
    fontStyle: 'italic',
  },
  username: {
    fontStyle: 'italic',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  location: {
    flex: 1,
  },
  locationEmoji: {
    paddingTop: 1,
  },
  storeEmoji: {
    fontSize: 12,
  },
  storeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  smallButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionsColumn: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 0,
    maxWidth: 168,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonEmoji: {
    fontSize: 14,
  },
  
  // Sleek Visitor Actions
  sleekPatchBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  sleekPatchBtnText: {
    letterSpacing: 0.3,
  },
  sleekMessageBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  sleekMessageEmoji: {
    fontSize: 15,
  },

  // Tags
  tagsScroll: {
    marginTop: 10,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  descriptionWrap: {
    paddingHorizontal: 4,
    paddingTop: 6,
    gap: 4,
  },
});

export default ProfileHeader;
