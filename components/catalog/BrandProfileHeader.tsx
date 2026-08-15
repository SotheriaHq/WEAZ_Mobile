import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions, Linking, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { BrandBadgeRail, type ProfileBadgeModel } from '@/components/catalog/ProfileBadge';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import type { ProfilePhotoViewState } from '@/src/types/profilePhoto';

const BRAND_DESCRIPTION_PREVIEW_LINES = 2;
const BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH = 120;

export type BrandHeaderStat = {
  label: string;
  value: string;
};

export type BrandHeaderContactItem = {
  label: string;
  value: string;
};

export type BrandProfileHeaderProps = {
  brandName: string;
  username?: string;
  location?: string | null;
  description?: string | null;
  contactItems?: BrandHeaderContactItem[];
  tags?: string[];
  stats?: BrandHeaderStat[];
  badges?: ProfileBadgeModel[];
  avatarUrl?: string;
  avatarFileId?: string | null;
  profilePhotoViewState?: ProfilePhotoViewState | null;
  bannerUrl?: string;
  bannerFileId?: string | null;
  isOwner?: boolean;
  isLoading?: boolean;
  isPatched?: boolean;
  patchLoading?: boolean;
  avatarLoading?: boolean;
  bannerLoading?: boolean;
  onPatch?: () => void;
  onMessage?: () => void;
  onEditProfile?: () => void;
  onCreate?: (e?: any) => void;
  createAnchorRef?: React.RefObject<View | null>;
  onCreateAnchorLayout?: () => void;
  onShare?: () => void;
  /** Role-aware compact three-dot menu. The caller supplies only actions allowed
   *  for the current owner, shopper, or public viewer. */
  onOpenMenu?: (event?: any) => void;
  menuAnchorRef?: React.RefObject<View | null>;
  qrTargetUrl?: string | null;
  onOpenQr?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  onViewAvatar?: () => void;
  onEditAvatar?: () => void;
  onEditBanner?: () => void;
  onNotifications?: () => void;
  unreadNotificationCount?: number;
};

function compactInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'T';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'T';
  const second = parts.length > 1 ? parts[1]?.[0] : '';
  return `${first}${second}`.toUpperCase();
}

function normalizeTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function getStoreStatusBadge(badges: ProfileBadgeModel[]) {
  return badges.find((badge) =>
    badge.variant.includes('open') ||
    badge.variant.includes('closed') ||
    badge.variant === 'pending_verification'
  ) ?? null;
}

function StoreStatusBadge({ badge }: { badge: ProfileBadgeModel | null }) {
  const { theme } = useTheme();
  const toast = useToast();

  if (!badge) return null;

  const isOpen = badge.variant.includes('open');
  const isClosed = badge.variant.includes('closed');
  const color = isOpen ? theme.colors.success : isClosed ? theme.colors.textMuted : theme.colors.warning;
  const label = isOpen ? 'Open' : isClosed ? 'Closed' : 'Limited or custom-only';

  return (
    <Pressable
      onPress={() => toast.info('Store status: green means Open, gray means Closed, yellow means Limited or custom-only.')}
      hitSlop={tokens.spacing.sm}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap for store status legend.`}
      style={styles.storeStatusButton}
    >
      {/* Color-only wavy square: green=open, gray=closed, yellow=limited/custom-only. */}
      <View style={[styles.storeStatusBadge, { backgroundColor: color }]}>
        <View style={[styles.storeStatusCorner, styles.storeStatusCornerTopLeft, { backgroundColor: color }]} />
        <View style={[styles.storeStatusCorner, styles.storeStatusCornerTopRight, { backgroundColor: color }]} />
        <View style={[styles.storeStatusCorner, styles.storeStatusCornerBottomLeft, { backgroundColor: color }]} />
        <View style={[styles.storeStatusCorner, styles.storeStatusCornerBottomRight, { backgroundColor: color }]} />
      </View>
    </Pressable>
  );
}

function HeaderIconButton({
  label,
  value,
  onPress,
  disabled = false,
  bare = false,
  badgeCount,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  bare?: boolean;
  badgeCount?: number;
}) {
  const { theme } = useTheme();

  if (!onPress) return null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.headerIconButton,
        bare && styles.headerIconButtonBare,
        {
          backgroundColor: bare ? 'transparent' : tokens.scrim(0.28),
          borderColor: bare ? 'transparent' : tokens.tintLight(0.15),
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* `tone`, not a colour override: AppText owns colour, and the glyph is
          an emoji, which renders in its own palette regardless. */}
      <AppText variant="bodyReadable" tone={bare ? 'default' : 'inverse'} style={styles.headerIconText}>
        {value}
      </AppText>
      {typeof badgeCount === 'number' && badgeCount > 0 ? (
        // Notification count: no background pill — the number renders in the
        // system/brand color and bold, matching the runway + island convention.
        <View style={styles.headerIconBadge} pointerEvents="none">
          <AppText variant="badgeLabel" tone="primary" style={styles.headerIconBadgeText}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function BannerHeader({
  brandName,
  badges,
  bannerUrl,
  bannerFileId,
  bannerLoading,
  isOwner,
  onBack,
  onSearch,
  onShare,
  onOpenMenu,
  menuAnchorRef,
  qrTargetUrl,
  onOpenQr,
  onEditBanner,
  onNotifications,
  unreadNotificationCount,
}: Pick<
  BrandProfileHeaderProps,
  | 'brandName'
  | 'badges'
  | 'bannerUrl'
  | 'bannerFileId'
  | 'bannerLoading'
  | 'isOwner'
  | 'onBack'
  | 'onSearch'
  | 'onShare'
  | 'onOpenMenu'
  | 'menuAnchorRef'
  | 'qrTargetUrl'
  | 'onOpenQr'
  | 'onEditBanner'
  | 'onNotifications'
  | 'unreadNotificationCount'
>) {
  const { scheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const resolvedBanner = useResolvedImageUri({
    src: bannerUrl,
    fileId: bannerFileId ?? undefined,
    allowSignedFallback: isOwner,
  });
  const storeStatusBadge = getStoreStatusBadge(badges ?? []);

  return (
    <View style={[styles.bannerWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={[styles.bannerImage, bannerLoading ? styles.uploadPreviewDim : null]}>
        {resolvedBanner ? (
          <StableImage
            uri={resolvedBanner}
            containerStyle={styles.bannerImage}
            imageStyle={styles.bannerImage}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[theme.colors.surfaceAlt, theme.colors.primarySoft, theme.colors.surface] as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}
      </View>

      <View style={[styles.bannerShade, { backgroundColor: theme.colors.backdrop }]} />
      {/* A shimmer, not a status report.
          This was a blurred overlay carrying a pill that said "Uploading" —
          chrome announcing a background task the user already knows they
          started, sitting on top of the image they are trying to see. A
          skeleton says the same thing without words, and because it is the
          shape of the thing being loaded it simply stops when the picture is
          there. No transition to narrate, nothing to read. */}
      {bannerLoading ? (
        <Skeleton style={styles.bannerLoadingOverlay} borderRadius={0} />
      ) : null}

      <View style={[styles.bannerControls, { top: insets.top }]}>
        <HeaderIconButton label="Go back" value="👈" onPress={onBack} />
        <View style={styles.bannerRightControls}>
          {onNotifications ? (
            <HeaderIconButton label="Notifications" value="🔔" onPress={onNotifications} badgeCount={unreadNotificationCount} />
          ) : (
            <HeaderIconButton label="Search" value="🔍" onPress={onSearch} />
          )}
          {onOpenMenu ? (
            <View ref={menuAnchorRef} collapsable={false}>
              <HeaderIconButton label="More options" value="⋯" onPress={onOpenMenu} />
            </View>
          ) : (
            <HeaderIconButton label="Share brand" value="⋯" onPress={onShare} />
          )}
        </View>
      </View>



      <View style={[styles.bannerNameChip, { backgroundColor: 'transparent', borderColor: theme.colors.glassBorder }]}>
        <BlurView
          intensity={Math.max(14, Math.round(theme.colors.glassBlur * 0.5))}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scheme === 'dark' ? tokens.scrim(0.14) : tokens.colors.inkWash },
          ]}
        />
        <AppText variant="title" tone="inverse" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.bannerNameText}>
          {brandName}
        </AppText>
        <StoreStatusBadge badge={storeStatusBadge} />
      </View>

      {isOwner && onEditBanner ? (
        <View style={styles.bannerEditControl}>
          <Pressable
            onPress={onEditBanner}
            disabled={bannerLoading}
            style={({ pressed }) => [
              styles.bannerEditButton,
              { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder },
              (pressed || bannerLoading) && styles.pressedControl,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit banner"
          >
            <AppText variant="captionBold" tone="default">
              {bannerLoading ? '…' : '✎'}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function OverlayAvatar({
  brandName,
  avatarUrl,
  avatarFileId,
  profilePhotoViewState,
  avatarLoading,
  isOwner,
  onViewAvatar,
  onEditAvatar,
}: Pick<
  BrandProfileHeaderProps,
  | 'brandName'
  | 'avatarUrl'
  | 'avatarFileId'
  | 'profilePhotoViewState'
  | 'avatarLoading'
  | 'isOwner'
  | 'onViewAvatar'
  | 'onEditAvatar'
>) {
  const { theme } = useTheme();
  const resolvedAvatar = useResolvedImageUri({
    src: avatarUrl,
    fileId: avatarFileId ?? undefined,
    allowSignedFallback: isOwner,
  });
  const initials = useMemo(() => compactInitials(brandName), [brandName]);
  const avatarAction = onViewAvatar;
  const hasVersion = Boolean(profilePhotoViewState?.profilePhotoUpdatedAt);
  const ringColor =
    resolvedAvatar && hasVersion
      ? profilePhotoViewState?.hasUnviewedUpdate
        ? theme.colors.primary
        : theme.colors.border
      : theme.colors.surface;

  return (
    <Pressable
      onPress={avatarAction}
      disabled={!avatarAction}
      style={({ pressed }) => [
        styles.avatarFrame,
        {
          backgroundColor: theme.colors.surface,
          borderColor: ringColor,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      accessibilityRole={avatarAction ? 'button' : undefined}
      accessibilityLabel="View brand logo"
    >
      <View style={[styles.avatarImage, avatarLoading ? styles.uploadPreviewDim : null]}>
        {resolvedAvatar ? (
          <StableImage
            uri={resolvedAvatar}
            containerStyle={styles.avatarImage}
            imageStyle={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primarySoft }]}>
            <AppText variant="title" tone="primary" numberOfLines={1}>
              {initials}
            </AppText>
          </View>
        )}
      </View>

      {/* Same treatment as the banner: the avatar's own shape, shimmering. */}
      {avatarLoading ? (
        <Skeleton style={styles.avatarLoading} borderRadius={tokens.radius.xl - 3} />
      ) : null}

      {isOwner && onEditAvatar ? (
        // No filled chip. The solid purple disc read as a status badge stuck to
        // the logo rather than a control, and it covered the corner of the image
        // it was meant to let you change. It now sits in the bottom-right corner
        // as a bare glyph, kept legible over any photo by a shadow instead of a
        // background.
        <Pressable
          onPress={onEditAvatar}
          style={({ pressed }) => [styles.avatarEditBadge, pressed ? styles.pressedControl : null]}
          hitSlop={tokens.spacing.sm}
          accessibilityRole="button"
          accessibilityLabel="Edit brand logo"
        >
          <AppText variant="subtitle" tone="inverse" style={styles.avatarEditGlyph}>
            ✎
          </AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function BrandStatsRow({ stats }: { stats: BrandHeaderStat[] }) {
  const { theme } = useTheme();
  if (stats.length === 0) return null;

  return (
    <View style={styles.statsRow}>
      {stats.map((stat, index) => (
        <React.Fragment key={`${stat.label}-${index}`}>
          {index > 0 ? <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} /> : null}
          <View style={styles.statItem}>
            <AppText
              variant="statValue"
              tone="secondary"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={styles.statValue}
            >
              {stat.value}
            </AppText>
            <AppText
              variant="statLabel"
              tone="muted"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.58}
              style={styles.statLabel}
            >
              {stat.label}
            </AppText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function BrandTextTags({ tags }: { tags: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const cleanedTags = useMemo(
    () => tags.map(normalizeTag).filter((tag): tag is string => Boolean(tag)),
    [tags],
  );
  const extraCount = Math.max(0, cleanedTags.length - 3);
  const visibleTags = expanded ? cleanedTags : cleanedTags.slice(0, 3);

  useEffect(() => {
    setExpanded(false);
  }, [cleanedTags.join('|')]);

  if (cleanedTags.length === 0) return null;

  return (
    <View style={styles.textTagsRow}>
      {visibleTags.map((tag) => (
        <AppText key={tag} variant="captionBold" tone="primary" numberOfLines={1} style={styles.textTag}>
          {tag}
        </AppText>
      ))}
      {!expanded && extraCount > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${extraCount} more brand tags`}
          style={({ pressed }) => [styles.textTagControl, pressed ? styles.pressedControl : null]}
        >
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            +{extraCount}
          </AppText>
        </Pressable>
      ) : null}
      {expanded && extraCount > 0 ? (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Collapse brand tags"
          style={({ pressed }) => [styles.textTagControl, pressed ? styles.pressedControl : null]}
        >
          <AppText variant="captionBold" tone="primary" numberOfLines={1}>
            See less
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function SideBrandMetaBlock({
  username,
  location,
  stats,
  tags,
  badges,
  isOwner,
  onEditProfile,
}: {
  username?: string | null;
  location?: string | null;
  stats: BrandHeaderStat[];
  tags: string[];
  badges: ProfileBadgeModel[];
  isOwner?: boolean;
  onEditProfile?: () => void;
}) {
  const secondaryBadges = badges.filter((badge) => !badge.variant.startsWith('store_'));
  const handle = username?.trim().replace(/^@+/, '') || '';
  const locationLabel = location?.trim() || '';

  return (
    <View style={styles.metaBlock}>
      {handle ? (
        <AppText variant="smallBold" tone="primary" numberOfLines={1} style={styles.usernameText}>
          @{handle}
        </AppText>
      ) : null}
      {locationLabel ? (
        <AppText variant="smallBold" tone="secondary" numberOfLines={1} style={styles.locationText}>
          📍 {locationLabel}
        </AppText>
      ) : isOwner && onEditProfile ? (
        // An owner whose location is blank previously saw nothing at all here —
        // no row, no hint, no way to tell whether the field was empty or the
        // header had dropped it. Say which it is, and make it the fix.
        <Pressable onPress={onEditProfile} accessibilityRole="button" accessibilityLabel="Add your location">
          <AppText variant="smallBold" tone="primary" numberOfLines={1} style={styles.locationText}>
            📍 Add your location
          </AppText>
        </Pressable>
      ) : null}

      <BrandBadgeRail badges={secondaryBadges} />
      <BrandStatsRow stats={stats} />
      <BrandTextTags tags={tags} />
    </View>
  );
}

function BrandDescription({ description }: { description?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const copy = description?.trim();

  useEffect(() => {
    setExpanded(false);
    setCanExpand((copy?.length ?? 0) > BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH);
  }, [copy]);

  if (!copy) return null;

  const handleMeasuredTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const hasHiddenLines = event.nativeEvent.lines.length > BRAND_DESCRIPTION_PREVIEW_LINES;
    const hasLongCopy = copy.length > BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH;
    const nextCanExpand = hasHiddenLines || hasLongCopy;
    setCanExpand((current) => (current === nextCanExpand ? current : nextCanExpand));
  };

  return (
    <View style={styles.descriptionWrap}>
      <AppText
        variant="bodyReadable"
        tone="default"
        numberOfLines={expanded ? undefined : BRAND_DESCRIPTION_PREVIEW_LINES}
      >
        {copy}
      </AppText>
      <AppText
        variant="bodyReadable"
        tone="default"
        style={styles.descriptionMeasureText}
        onTextLayout={handleMeasuredTextLayout}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {copy}
      </AppText>
      {canExpand && !expanded ? (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" accessibilityLabel="Show full brand description">
          <AppText variant="smallBold" tone="primary" style={styles.expandToggle}>
            See more
          </AppText>
        </Pressable>
      ) : null}
      {canExpand && expanded ? (
        <Pressable onPress={() => setExpanded(false)} accessibilityRole="button" accessibilityLabel="Collapse brand description">
          <AppText variant="smallBold" tone="primary" style={styles.expandToggle}>
            See less
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Contact-row markers as emoji (Rule 5), not icon-library glyphs.
 *
 * A trade-off worth naming: 📸 and 📘 are weaker stand-ins for Instagram's and
 * Meta's real marks than the vector glyphs were. Rule 5 is mandatory and
 * explicitly prefers "a single emoji over a custom SVG icon", the rest of this
 * app is emoji-forward throughout (the Studio menu, the island dock, every
 * status chip), and each row carries the platform NAME beside the marker — so
 * the emoji identifies rather than has to be recognised. ✖️ for X is the
 * current brand, not the retired bird.
 *
 * The brand-colour tokens these used to be tinted with are gone: emoji render
 * as colour glyphs and ignore `color` on both platforms, so keeping them would
 * have been dead configuration.
 */
const CONTACT_MARKERS: Record<string, string> = {
  instagram: '📸',
  facebook: '📘',
  x: '✖️',
  twitter: '✖️',
  email: '✉️',
  phone: '📞',
  website: '🌐',
};

function ContactIcon({ label }: { label: string }) {
  const normalized = label.trim().toLowerCase();
  return (
    <AppText variant="bodyReadable" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {CONTACT_MARKERS[normalized] ?? '🔗'}
    </AppText>
  );
}

function getContactUrl(label: string, value: string): string | null {
  const normalized = label.trim().toLowerCase();
  const cleanValue = value.trim();
  switch (normalized) {
    case 'instagram': return `https://instagram.com/${cleanValue.replace('@', '')}`;
    case 'facebook': return `https://facebook.com/${cleanValue}`;
    case 'x':
    case 'twitter': return `https://twitter.com/${cleanValue.replace('@', '')}`;
    case 'email': return `mailto:${cleanValue}`;
    case 'phone': return `tel:${cleanValue.replace(/[^0-9+]/g, '')}`;
    case 'website': return cleanValue.startsWith('http') ? cleanValue : `https://${cleanValue}`;
    default: return null;
  }
}

function BrandContactItems({
  items = [],
  qrTargetUrl,
  onOpenQr,
}: {
  items?: BrandHeaderContactItem[];
  qrTargetUrl?: string | null;
  onOpenQr?: () => void;
}) {
  const visibleItems = items.filter((item) => item.value.trim().length > 0);
  const hasQr = Boolean(qrTargetUrl || onOpenQr);
  const { theme } = useTheme();

  if (visibleItems.length === 0 && !hasQr) return null;

  return (
    <View style={styles.contactWrap}>
      {visibleItems.map((item) => (
        <Pressable 
          key={`${item.label}-${item.value}`} 
          style={styles.contactActionRow}
          onPress={() => {
            const url = getContactUrl(item.label, item.value);
            if (url) {
              void Linking.openURL(url).catch(() => undefined);
            }
          }}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={`Open ${item.label} ${item.value}`}
        >
          <ContactIcon label={item.label} />
          {/* Deep near-black, not brand purple. Every contact row was purple,
              which made a plain email address look like a promoted link and
              fought with the coloured platform icon next to it. The icon
              already carries the affordance. */}
          <AppText
            variant="smallBold"
            tone="default"
            numberOfLines={1}
            style={styles.contactLine}
          >
            {item.value}
          </AppText>
        </Pressable>
      ))}
      {hasQr ? (
        <Pressable
          onPress={onOpenQr}
          style={styles.contactActionRow}
          accessibilityRole="button"
          accessibilityLabel="Open brand profile QR code"
        >
          <AppText variant="bodyReadable" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            🔳
          </AppText>
          <AppText variant="smallBold" tone="default" numberOfLines={1} style={styles.contactLine}>
            QR code
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function BrandProfileDetails({
  description,
  contactItems,
  qrTargetUrl,
  onOpenQr,
}: {
  description?: string | null;
  contactItems?: BrandHeaderContactItem[];
  qrTargetUrl?: string | null;
  onOpenQr?: () => void;
}) {
  const hasDescription = Boolean(description?.trim());
  const hasContact = Boolean(contactItems?.some((item) => item.value.trim().length > 0));
  const hasQr = Boolean(qrTargetUrl || onOpenQr);

  if (!hasDescription && !hasContact && !hasQr) return null;

  return (
    <View>
      <BrandDescription description={description} />
      <BrandContactItems items={contactItems} qrTargetUrl={qrTargetUrl} onOpenQr={onOpenQr} />
    </View>
  );
}

function VisitorActionIconButton({
  icon,
  label,
  onPress,
  disabled,
  loading,
  emphasized,
  selected,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  emphasized?: boolean;
  selected?: boolean;
}) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={tokens.spacing.sm}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(isDisabled), selected: Boolean(selected) }}
      style={({ pressed }) => [
        styles.visitorActionButton,
        {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          opacity: isDisabled ? 0.55 : pressed ? 0.78 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <AppText
          variant={emphasized ? 'title' : 'subtitle'}
          tone={selected ? 'muted' : 'secondary'}
          style={styles.visitorActionIcon}
        >
          {icon}
        </AppText>
      )}
    </Pressable>
  );
}

function BrandProfileActions({
  isOwner,
  isPatched,
  patchLoading,
  onPatch,
  onMessage,
  onEditProfile,
  onCreate,
  createAnchorRef,
  onCreateAnchorLayout,
  onShare,
}: Pick<
  BrandProfileHeaderProps,
  | 'isOwner'
  | 'isPatched'
  | 'patchLoading'
  | 'onPatch'
  | 'onMessage'
  | 'onEditProfile'
  | 'onCreate'
  | 'createAnchorRef'
  | 'onCreateAnchorLayout'
  | 'onShare'
>) {
  const { theme } = useTheme();

  if (isOwner) {
    return (
      <View style={styles.actionRow}>
        <View style={styles.primaryActionSlot}>
          <Button
            title="Edit Profile"
            size="md"
            variant="primary"
            onPress={onEditProfile}
            disabled={!onEditProfile}
            fullWidth
            style={styles.actionButton}
          />
        </View>
        <View style={styles.secondaryActionSlot}>
          <Button title="Share" size="md" variant="outline" onPress={onShare} disabled={!onShare} fullWidth style={styles.actionButton} />
        </View>
        {onCreate ? (
          <View ref={createAnchorRef} onLayout={onCreateAnchorLayout} collapsable={false}>
            <Pressable
              onPress={(e) => onCreate?.(e)}
              style={({ pressed }) => [
                styles.squareAction,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create catalog content"
            >
              <AppText variant="title" tone="primary">
                +
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.actionRow, styles.visitorActionRow]}>
      <VisitorActionIconButton
        icon="🪡"
        label={isPatched ? 'Unpatch brand' : 'Patch brand'}
        onPress={onPatch}
        disabled={!onPatch || patchLoading}
        loading={patchLoading}
        emphasized={!isPatched}
        selected={isPatched}
      />
      {onMessage ? (
        <VisitorActionIconButton
          icon="💬"
          label="Message brand"
          onPress={onMessage}
        />
      ) : null}
      <VisitorActionIconButton
        icon="↗"
        label="Share brand"
        onPress={onShare}
        disabled={!onShare}
      />
    </View>
  );
}

export function BrandProfileHeaderSkeleton() {
  const { theme } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <Skeleton width="100%" height={200} borderRadius={0} />
      <View style={styles.identityRow}>
        <Skeleton width={116} height={116} borderRadius={tokens.radius.xl} />
        <View style={styles.skeletonMeta}>
          <Skeleton width="74%" height={26} borderRadius={tokens.radius.sm} />
          <Skeleton width="62%" height={14} borderRadius={tokens.radius.sm} />
          <View style={styles.skeletonStats}>
            <Skeleton width={48} height={28} borderRadius={tokens.radius.sm} />
            <Skeleton width={58} height={28} borderRadius={tokens.radius.sm} />
            <Skeleton width={44} height={28} borderRadius={tokens.radius.sm} />
          </View>
        </View>
      </View>
      <View style={styles.descriptionWrap}>
        <SkeletonText lines={2} lineHeight={16} spacing={tokens.spacing.sm} lastLineWidth="72%" />
      </View>
    </View>
  );
}

export function BrandProfileHeader({
  brandName,
  username,
  location,
  description,
  contactItems = [],
  tags = [],
  stats = [],
  badges = [],
  avatarUrl,
  avatarFileId,
  profilePhotoViewState,
  bannerUrl,
  bannerFileId,
  isOwner = false,
  isLoading = false,
  isPatched = false,
  patchLoading = false,
  avatarLoading = false,
  bannerLoading = false,
  onPatch,
  onMessage,
  onEditProfile,
  onCreate,
  createAnchorRef,
  onCreateAnchorLayout,
  onShare,
  onOpenMenu,
  menuAnchorRef,
  qrTargetUrl,
  onOpenQr,
  onBack,
  onSearch,
  onViewAvatar,
  onEditAvatar,
  onEditBanner,
  onNotifications,
  unreadNotificationCount,
}: BrandProfileHeaderProps) {
  const { theme } = useTheme();
  const effectiveName = brandName || username || 'WIEZ Brand';
  const { width } = useWindowDimensions();
  const useFullWidthStats = width < 380;

  if (isLoading) {
    return <BrandProfileHeaderSkeleton />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <BannerHeader
        brandName={effectiveName}
        badges={badges}
        bannerUrl={bannerUrl}
        bannerFileId={bannerFileId}
        bannerLoading={bannerLoading}
        isOwner={isOwner}
        onBack={onBack}
        onSearch={onSearch}
        onShare={onShare}
        onOpenMenu={onOpenMenu}
        menuAnchorRef={menuAnchorRef}
        qrTargetUrl={qrTargetUrl}
        onOpenQr={onOpenQr}
        onEditBanner={onEditBanner}
        onNotifications={onNotifications}
        unreadNotificationCount={unreadNotificationCount}
      />

      <View style={styles.identityRow}>
        <OverlayAvatar
          brandName={effectiveName}
          avatarUrl={avatarUrl}
          avatarFileId={avatarFileId}
          profilePhotoViewState={profilePhotoViewState}
          avatarLoading={avatarLoading}
          isOwner={isOwner}
          onViewAvatar={onViewAvatar}
          onEditAvatar={onEditAvatar}
        />
        <SideBrandMetaBlock
          username={username}
          location={location}
          stats={useFullWidthStats ? [] : stats}
          tags={tags}
          badges={badges}
          isOwner={isOwner}
          onEditProfile={onEditProfile}
        />
      </View>

      {useFullWidthStats ? (
        <View style={styles.fullWidthStatsWrap}>
          <BrandStatsRow stats={stats} />
        </View>
      ) : null}

      <BrandProfileDetails description={description} contactItems={contactItems} qrTargetUrl={qrTargetUrl} onOpenQr={onOpenQr} />

      <BrandProfileActions
        isOwner={isOwner}
        isPatched={isPatched}
        patchLoading={patchLoading}
        onPatch={onPatch}
        onMessage={onMessage}
        onEditProfile={onEditProfile}
        onCreate={onCreate}
        createAnchorRef={createAnchorRef}
        onCreateAnchorLayout={onCreateAnchorLayout}
        onShare={onShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: tokens.spacing.lg,
  },
  bannerWrap: {
    height: 204,
    overflow: 'hidden',
    borderBottomLeftRadius: tokens.radius.xl,
    borderBottomRightRadius: tokens.radius.xl,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  uploadPreviewDim: {
    opacity: 0.56,
  },
  bannerShade: {
    ...StyleSheet.absoluteFill,
  },
  bannerLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  bannerControls: {
    position: 'absolute',
    top: 0,
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  bannerQrSlot: {
    position: 'absolute',
    zIndex: 2,
  },
  qrButton: {
    width: 74,
    height: 74,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonBare: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    overflow: 'visible',
  },
  headerIconText: {
    textAlign: 'center',
  },
  /* `fontStyle` is legal on AppText; size/weight/colour are not — those come
     from the `smallBold` variant. The old inline 10px size was also below
     the 12px floor in Rule 22, so this fixes a second violation. */
  expandToggle: {
    fontStyle: 'italic',
  },
  headerIconBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBadgeText: {
    textAlign: 'center',
  },
  bannerNameChip: {
    position: 'absolute',
    left: 132,
    bottom: 0,
    alignSelf: 'flex-start',
    maxWidth: '62%',
    minHeight: 38,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    borderBottomLeftRadius: tokens.radius.sm,
    borderBottomRightRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    overflow: 'hidden',
  },
  bannerNameText: {
    minWidth: 0,
    flexShrink: 1,
  },
  bannerEditControl: {
    position: 'absolute',
    right: tokens.spacing.lg,
    bottom: tokens.spacing.sm,
    zIndex: 3,
  },
  bannerEditButton: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeStatusButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeStatusBadge: {
    width: 18,
    height: 18,
    borderRadius: tokens.radius.sm,
    transform: [{ rotate: '45deg' }],
  },
  storeStatusCorner: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: tokens.radius.full,
  },
  storeStatusCornerTopLeft: {
    top: -3,
    left: 5,
  },
  storeStatusCornerTopRight: {
    right: -3,
    top: 5,
  },
  storeStatusCornerBottomLeft: {
    left: -3,
    bottom: 5,
  },
  storeStatusCornerBottomRight: {
    bottom: -3,
    right: 5,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: -54,
  },
  avatarFrame: {
    width: 116,
    height: 116,
    borderRadius: tokens.radius.xl,
    borderWidth: 3,
    overflow: 'visible',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.xl - 3,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.xl - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLoading: {
    ...StyleSheet.absoluteFill,
    borderRadius: tokens.radius.xl - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: tokens.spacing.xs,
    bottom: tokens.spacing.xs,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditGlyph: {
    // Stands in for the removed background disc: enough separation to stay
    // readable on a light logo without putting a coloured shape on the image.
    textShadowColor: tokens.scrim(0.62),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaBlock: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing['4xl'] + tokens.spacing.sm,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    minWidth: 0,
  },
  brandNameText: {
    minWidth: 0,
    flexShrink: 1,
  },
  usernameText: {
    maxWidth: '100%',
  },
  locationText: {
    maxWidth: '100%',
    marginTop: -tokens.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  statItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  statValue: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  statLabel: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: tokens.spacing.xs / 2,
  },
  fullWidthStatsWrap: {
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
  },
  textTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  textTag: {
    flexShrink: 1,
  },
  textTagControl: {
    flexShrink: 0,
  },
  pressedControl: {
    opacity: 0.72,
  },
  descriptionWrap: {
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.xl2, // Increased gap below the see less/more
    gap: tokens.spacing.sm,
  },
  descriptionMeasureText: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    top: 0,
    opacity: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing['2xl'],
  },
  primaryActionSlot: {
    flex: 1,
    minWidth: 0,
  },
  secondaryActionSlot: {
    width: 104,
  },
  actionButton: {
    borderRadius: tokens.radius.md,
  },
  visitorActionRow: {
    justifyContent: 'flex-start',
  },
  visitorActionButton: {
    width: 48,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorActionIcon: {
    textAlign: 'center',
  },
  contactWrap: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
  },
  contactActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: tokens.spacing.xs,
    maxWidth: '100%',
  },
  contactLine: {
    maxWidth: '100%',
  },
  squareAction: {
    width: 52,
    height: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonMeta: {
    flex: 1,
    gap: tokens.spacing.md,
  },
  skeletonStats: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
});

export default BrandProfileHeader;
