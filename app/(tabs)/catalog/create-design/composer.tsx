import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppFloatingMenu, type FloatingMenuOption } from '@/components/ui/AppFloatingMenu';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppMultiSelectSheet, AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { OptionRow } from '@/components/ui/OptionRow';
import { RequiredFieldLabel } from '@/components/ui/RequiredFieldLabel';
import { StableImage } from '@/components/ui/StableImage';
import type { FilterDimensionOption } from '@/src/api/DesignApi';
import TagsApi from '@/src/api/TagsApi';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import {
  DESIGN_EDITOR_MAX_MEDIA,
  DESIGN_CREATION_SIZING_OPTIONS,
  DESIGN_FIT_PREFERENCE_LABELS,
  DESIGN_MEDIA_SLOTS,
  DESIGN_SIZING_LABELS,
  DESIGN_TARGET_AGE_LABELS,
  DESIGN_VISIBILITY_LABELS,
  getMediaViewSlotLabel,
  getMissingRequiredMediaSlots,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { queryKeys } from '@/src/query/queryKeys';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { DesignEditorMediaSource } from '@/src/features/design-editor/designEditorMediaFlow';
import { perfMeasure } from '@/src/utils/perf';
import { navPerf } from '@/src/utils/navPerf';
import {
  CREATOR_AUDIENCE_OPTIONS,
  CREATOR_METADATA_HELP,
  getAudienceLabel,
  getDiscoveryDimensionHelp,
  getDiscoveryDimensionLabel,
  getDiscoveryDimensionSortIndex,
  isLegacyDiscoveryDimensionSlug,
  normalizeHashtagLabel,
} from '@/src/utils/creatorMetadata';

const PRIVACY_OPTIONS = [
  { value: 'PUBLIC', label: DESIGN_VISIBILITY_LABELS.PUBLIC },
  { value: 'PRIVATE', label: DESIGN_VISIBILITY_LABELS.PRIVATE },
] as const;

const TARGET_AGE_OPTIONS: Array<{ value: 'ADULT' | 'CHILD'; label: string }> = [
  { value: 'ADULT', label: DESIGN_TARGET_AGE_LABELS.ADULT },
  { value: 'CHILD', label: DESIGN_TARGET_AGE_LABELS.CHILD },
];

const STYLE_DETAIL_DIMENSION_SLUGS = new Set(['style', 'fabric', 'color-family', 'fit']);
const STANDALONE_DISCOVERY_DIMENSION_SLUGS = new Set(['heritage', 'occasion']);

function formatPriceSummary(minPrice: string, maxPrice: string) {
  if (minPrice && maxPrice) return `NGN ${minPrice} - NGN ${maxPrice}`;
  if (minPrice) return `From NGN ${minPrice}`;
  if (maxPrice) return `Up to NGN ${maxPrice}`;
  return 'Not set';
}

export default function CreateDesignComposerScreen() {
  const {
    booting,
    loadingError,
    assets,
    coverAssetId,
    form,
    categories,
    selectedCategory,
    subCategories,
    filterDimensions,
    filterSelection,
    measurementPoints,
    customMeasurementKeys,
    permissionIssue,
    updateField,
    toggleFilterValue,
    toggleMeasurementKey,
    removeAsset,
    setCoverAssetId,
    save,
    saveState,
    canSaveDraft,
    isEditMode,
    pickMedia,
    clearPermissionIssue,
    openMediaPermissionSettings,
    retryBootstrap,
  } = useDesignEditor();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ blank?: string | string[]; autoOpenPickerSource?: string | string[] }>();
  const blankParam = Array.isArray(params.blank) ? params.blank[0] : params.blank;
  const autoOpenPickerSourceParam = Array.isArray(params.autoOpenPickerSource) ? params.autoOpenPickerSource[0] : params.autoOpenPickerSource;
  // The user explicitly chose "Start a design" (no media yet) — keep the empty
  // composer open instead of bouncing back to the catalogue.
  const isBlankStart = blankParam === '1' || blankParam === 'true' || !!autoOpenPickerSourceParam;
  const hasEverHadAssetsRef = useRef(false);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [customOrdersOpen, setCustomOrdersOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [ageGroupOpen, setAgeGroupOpen] = useState(false);
  const [styleDetailsOpen, setStyleDetailsOpen] = useState(false);
  const [heritageOpen, setHeritageOpen] = useState(false);
  const [occasionOpen, setOccasionOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  // Source chosen in the media option sheet, launched only AFTER the sheet has
  // fully dismissed so the app sheet/backdrop never lingers behind the system
  // picker (see the pending-picker effect below).
  const [pendingPickerSource, setPendingPickerSource] = useState<'camera' | 'library' | null>(null);
  const [categoryStep, setCategoryStep] = useState<'category' | 'subcategory'>('category');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftSubCategoryId, setDraftSubCategoryId] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<{ name: string; usageCount: number }[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const mediaAnchorRef = useRef<View | null>(null);
  const [mediaAnchorMetrics, setMediaAnchorMetrics] = useState<{
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);

  const [renderSheets, setRenderSheets] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setRenderSheets(true);
    });
    return () => handle.cancel();
  }, []);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    // Sync the form's collapse/expand to the OS keyboard animation curve instead of
    // a fixed easeInEaseOut preset. scheduleLayoutAnimation uses the keyboard event's
    // own duration/easing, so the footer + scroll padding move WITH the keyboard
    // rather than skipping/shaking. Falls back gracefully when the event carries no
    // animation metadata (older Android emits didShow/didHide without a curve).
    const animateForEvent = (event: { duration?: number } | undefined) => {
      if (event && typeof event.duration === 'number' && event.duration > 0) {
        Keyboard.scheduleLayoutAnimation(event as Parameters<typeof Keyboard.scheduleLayoutAnimation>[0]);
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    };
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        animateForEvent(e);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        animateForEvent(e);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Android keyboard handling depends on whether the OS resized the window
  // (edge-to-edge `adjustResize`). When it resizes, the RN root height shrinks
  // and the sticky footer is lifted natively — adding our own offset would
  // double-count and float the footer too high. When it does NOT resize, the
  // footer stays behind the keyboard unless we lift it manually. We detect the
  // resize by comparing the live window height to the no-keyboard baseline, so
  // the footer ends up just above the keyboard on both configurations.
  const { height: windowHeight } = useWindowDimensions();
  const baseWindowHeightRef = useRef(windowHeight);
  if (keyboardHeight === 0 && windowHeight > baseWindowHeightRef.current) {
    baseWindowHeightRef.current = windowHeight;
  }
  const androidWindowResized =
    Platform.OS === 'android' &&
    keyboardHeight > 0 &&
    baseWindowHeightRef.current - windowHeight > keyboardHeight * 0.5;
  const audienceLabel = getAudienceLabel(form.audience);
  const sizingLabel = DESIGN_SIZING_LABELS[form.sizingMode];
  const fitPreferenceLabel = DESIGN_FIT_PREFERENCE_LABELS[form.fitPreference];
  const targetAgeLabel = DESIGN_TARGET_AGE_LABELS[form.targetAgeGroup];
  // Reflect the actual availability selection instead of a static label so the
  // chosen state (custom order vs standard) is always visible (Issue #6).
  const availabilityLabel =
    form.customOrderEnabled ||
    form.sizingMode === 'CUSTOM' ||
    form.sizingMode === 'RTW_PLUS_FITTINGS'
      ? 'Custom order'
      : 'Standard';
  const selectedSubCategory =
    selectedCategory?.subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const categoryValue = selectedCategory?.name ?? 'Select';
  const garmentTypeValue = selectedSubCategory?.name ?? (selectedCategory ? 'Select' : 'Choose item first');

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );
  const draftSelectedCategory = useMemo(
    () => categories.find((entry) => entry.id === draftCategoryId) ?? null,
    [categories, draftCategoryId],
  );
  const draftSubCategories = draftSelectedCategory?.subCategories ?? [];

  const discoveryDimensions = useMemo(
    () =>
      [...filterDimensions]
        .filter(
          (dimension) =>
            (dimension.appliesTo.includes('DESIGN') || dimension.appliesTo.includes('COLLECTION')) &&
            !isLegacyDiscoveryDimensionSlug(dimension.slug),
        )
        .sort((a, b) => {
          const orderDelta = getDiscoveryDimensionSortIndex(a.slug) - getDiscoveryDimensionSortIndex(b.slug);
          return orderDelta || a.name.localeCompare(b.name);
        }),
    [filterDimensions],
  );
  const styleDetailDimensions = useMemo(
    () =>
      discoveryDimensions.filter(
        (dimension) =>
          STYLE_DETAIL_DIMENSION_SLUGS.has(dimension.slug) ||
          !STANDALONE_DISCOVERY_DIMENSION_SLUGS.has(dimension.slug),
      ),
    [discoveryDimensions],
  );
  const heritageDimensions = useMemo(
    () => discoveryDimensions.filter((dimension) => dimension.slug === 'heritage'),
    [discoveryDimensions],
  );
  const occasionDimensions = useMemo(
    () => discoveryDimensions.filter((dimension) => dimension.slug === 'occasion'),
    [discoveryDimensions],
  );
  const selectedDiscoveryFilterCount = discoveryDimensions.reduce(
    (sum, dimension) => sum + (filterSelection[dimension.id]?.length ?? 0),
    0,
  );
  const styleDetailsCount = styleDetailDimensions.reduce(
    (sum, dimension) => sum + (filterSelection[dimension.id]?.length ?? 0),
    0,
  );
  const heritageCount = heritageDimensions.reduce(
    (sum, dimension) => sum + (filterSelection[dimension.id]?.length ?? 0),
    0,
  );
  const occasionCount = occasionDimensions.reduce(
    (sum, dimension) => sum + (filterSelection[dimension.id]?.length ?? 0),
    0,
  );

  const selectedTags = useMemo(
    () =>
      Array.from(
        new Set(
          form.tagsInput
            .split(',')
            .map((value) => value.trim().replace(/^#/, ''))
            .filter(Boolean),
        ),
      ),
    [form.tagsInput],
  );
  const tagOptions = useMemo(
    () =>
      tagSuggestions
        .filter((tag) => !selectedTags.includes(tag.name))
        .map((tag) => ({ value: tag.name, label: normalizeHashtagLabel(tag.name), usageCount: tag.usageCount })),
    [selectedTags, tagSuggestions],
  );
  const priceError = useMemo(() => {
    if (!form.minPrice || !form.maxPrice) return null;
    const min = Number(form.minPrice);
    const max = Number(form.maxPrice);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return max < min ? 'Maximum price must be greater than or equal to minimum price.' : null;
  }, [form.maxPrice, form.minPrice]);
  const missingRequiredMediaSlots = useMemo(
    () => getMissingRequiredMediaSlots(assets),
    [assets],
  );
  // Per-field inline errors for the custom-order / rush inputs. These mirror the
  // backend rules (custom-order-configurations service + DTO @Min(5)/@Max(13))
  // so the creator sees the problem next to the field and is blocked before
  // Preview — never as a submit-time 400. Returns null per field when valid.
  const customOrderFieldErrors = useMemo(() => {
    const empty = {
      baseCharge: null as string | null,
      fabricCost: null as string | null,
      fallbackYards: null as string | null,
      rushFee: null as string | null,
      rushTime: null as string | null,
    };
    if (!form.customOrderEnabled) return empty;

    const baseCharge = form.baseProductionCharge.trim() ? null : 'Enter a base charge.';
    const fabricCost = form.fabricCostPerYard.trim() ? null : 'Enter a fabric cost per yard.';
    const fallbackYards = form.fallbackOutputYards.trim() ? null : 'Enter fallback yards.';

    let rushFee: string | null = null;
    let rushTime: string | null = null;
    if (form.rushEnabled) {
      const fee = Number(form.rushFee);
      if (!form.rushFee.trim() || !Number.isFinite(fee) || fee <= 0) {
        rushFee = 'Rush fee must be greater than 0.';
      }
      const days = Number(form.rushProductionLeadDays);
      const standardDays = form.productionLeadDays.trim() ? Number(form.productionLeadDays) : 7;
      if (!form.rushProductionLeadDays.trim() || !Number.isInteger(days) || days < 5 || days > 13) {
        rushTime = 'Rush time must be 5–13 days.';
      } else if (Number.isFinite(standardDays) && days >= standardDays) {
        rushTime = 'Rush time must be shorter than production time.';
      }
    }
    return { baseCharge, fabricCost, fallbackYards, rushFee, rushTime };
  }, [
    form.baseProductionCharge,
    form.customOrderEnabled,
    form.fabricCostPerYard,
    form.fallbackOutputYards,
    form.productionLeadDays,
    form.rushEnabled,
    form.rushFee,
    form.rushProductionLeadDays,
  ]);
  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (assets.length === 0 || missingRequiredMediaSlots.length > 0) {
      const slotText =
        missingRequiredMediaSlots.length > 0
          ? missingRequiredMediaSlots.map(getMediaViewSlotLabel).join(', ')
          : 'Front, Back, Left Side, and Right Side';
      missing.push(`Selected media (${slotText})`);
    }
    if (form.title.trim().length === 0) missing.push('Title');
    if (!form.categoryId) missing.push('What is it?');
    if (!form.subCategoryId) missing.push('Garment type');
    if (!form.audience) missing.push('Who is it for?');
    if (selectedDiscoveryFilterCount === 0) missing.push('Style details');
    if (selectedTags.length === 0) missing.push('Tags');
    if (form.customOrderEnabled && customMeasurementKeys.length === 0) missing.push('Required custom-order fields');
    if (customOrderFieldErrors.baseCharge || customOrderFieldErrors.fabricCost || customOrderFieldErrors.fallbackYards) {
      missing.push('Custom order pricing');
    }
    if (customOrderFieldErrors.rushFee || customOrderFieldErrors.rushTime) {
      missing.push('Rush order settings');
    }
    return missing;
  }, [
    assets.length,
    customMeasurementKeys.length,
    customOrderFieldErrors,
    form.audience,
    form.categoryId,
    form.customOrderEnabled,
    form.subCategoryId,
    form.title,
    selectedDiscoveryFilterCount,
    selectedTags.length,
    missingRequiredMediaSlots,
  ]);
  const canPreview = missingRequiredFields.length === 0;
  // True when custom orders are on but something inside the (collapsed) Custom
  // orders sheet is missing/invalid — used to flag the row on the main form so
  // the creator knows to open it, since the inline field errors live in there.
  const customOrderNeedsAttention =
    form.customOrderEnabled &&
    (customMeasurementKeys.length === 0 ||
      Boolean(
        customOrderFieldErrors.baseCharge ||
          customOrderFieldErrors.fabricCost ||
          customOrderFieldErrors.fallbackYards ||
          customOrderFieldErrors.rushFee ||
          customOrderFieldErrors.rushTime,
      ));

  const handlePickMedia = useCallback(
    async (source: 'camera' | 'library') => {
      return pickMedia(source);
    },
    [pickMedia],
  );

  const captureMediaAnchorMetrics = useCallback(() => {
    requestAnimationFrame(() => {
      mediaAnchorRef.current?.measureInWindow((pageX, pageY, width, height) => {
        if (width <= 0 || height <= 0) return;
        setMediaAnchorMetrics({ pageX, pageY, width, height });
      });
    });
  }, []);

  const openMediaMenu = useCallback(() => {
    captureMediaAnchorMetrics();
    setMediaOpen(true);
  }, [captureMediaAnchorMetrics]);

  const mediaMenuOptions = useMemo<FloatingMenuOption[]>(
    () => [
      {
        key: 'camera',
        icon: '📷',
        title: 'Camera',
        onPress: () => {
          setPendingPickerSource('camera');
        },
      },
      {
        key: 'library',
        icon: '🖼️',
        title: 'Photo library',
        onPress: () => {
          setPendingPickerSource('library');
        },
      },
      {
        key: 'attachment',
        icon: '📎',
        title: 'Attachment',
        onPress: () => {
          setPendingPickerSource('library');
        },
      },
    ],
    [],
  );

  // Sequencing guard: only one sheet/picker is active at a time. Once the media
  // option sheet has closed (mediaOpen === false), wait for its dismissal
  // animation/interactions to settle, then launch the system picker. This stops
  // the system picker from opening on top of a still-collapsing app sheet (the
  // "layered/double-collapse" bug).
  useEffect(() => {
    if (mediaOpen || !pendingPickerSource) return;
    const source = pendingPickerSource;
    const handle = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        setPendingPickerSource(null);
        void handlePickMedia(source);
      }, 50);
    });
    return () => handle.cancel();
  }, [mediaOpen, pendingPickerSource, handlePickMedia]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenPickerSourceParam && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const source = autoOpenPickerSourceParam as 'camera' | 'library';
      void handlePickMedia(source);
    }
  }, [autoOpenPickerSourceParam, handlePickMedia]);

  useEffect(() => {
    perfMeasure('catalog-plus-to-composer', 'catalog-plus-tap');
    navPerf.screenMounted('create_design');
    navPerf.mark('composer_mounted');
    navPerf.firstVisibleUi('create_design');
  }, []);

  // data_ready = all metadata finished loading (full readiness).
  useEffect(() => {
    if (!booting) {
      navPerf.dataReady('create_design');
    }
  }, [booting]);



  const loadTags = useCallback(
    async (isActive: () => boolean = () => true, options?: { forceRefresh?: boolean }) => {
      // Seed from the React Query cache so re-opening the hashtag sheet shows the
      // popular tags immediately instead of flashing a loader (Issue #2).
      const cacheKey = queryKeys.tags.popular(50);
      const cached = queryClient.getQueryData<{ name: string; usageCount: number }[]>(cacheKey);
      if (cached && cached.length > 0 && !options?.forceRefresh) {
        if (isActive()) {
          setTagSuggestions(cached);
          setTagError(null);
        }
      } else {
        setTagsLoading(true);
      }
      setTagError(null);

      try {
        const items = await queryClient.fetchQuery({
          queryKey: cacheKey,
          queryFn: () => TagsApi.getTags(50),
          staleTime: 5 * 60 * 1000,
        });
        if (isActive()) {
          setTagSuggestions(items);
          setTagError(null);
        }
      } catch {
        if (isActive() && !(cached && cached.length > 0)) {
          setTagSuggestions([]);
          setTagError('Could not load hashtags. You can still add your own.');
        }
      } finally {
        if (isActive()) {
          setTagsLoading(false);
        }
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!tagsOpen) return;
    let active = true;
    void loadTags(() => active);
    return () => {
      active = false;
    };
  }, [loadTags, tagsOpen]);

  const closeCategorySheet = useCallback(() => {
    setCategoryOpen(false);
    setCategoryStep('category');
  }, []);

  const openCategorySheet = useCallback(
    (step: 'category' | 'subcategory') => {
      setDraftCategoryId(form.categoryId);
      setDraftSubCategoryId(form.subCategoryId);
      setCategoryStep(step === 'subcategory' && form.categoryId ? 'subcategory' : 'category');
      setCategoryOpen(true);
    },
    [form.categoryId, form.subCategoryId],
  );

  const handleCategoryDone = useCallback(() => {
    if (!draftSelectedCategory) return;
    if (draftSubCategories.length > 0 && !draftSubCategoryId) {
      setCategoryStep('subcategory');
      return;
    }
    updateField('categoryId', draftCategoryId);
    updateField('subCategoryId', draftSubCategoryId);
    closeCategorySheet();
  }, [
    closeCategorySheet,
    draftCategoryId,
    draftSelectedCategory,
    draftSubCategories.length,
    draftSubCategoryId,
    updateField,
  ]);

  useEffect(() => {
    if (assets.length > 0) {
      hasEverHadAssetsRef.current = true;
    }
  }, [assets.length]);

  const shouldRedirectEmptyCreate =
    !booting &&
    !isEditMode &&
    !isBlankStart &&
    assets.length === 0 &&
    !hasEverHadAssetsRef.current &&
    !permissionIssue;

  // usable_ui = the form + footer actions are actually interactive
  useEffect(() => {
    navPerf.mark('usable_ui');
    navPerf.mark('footer_actions_visible');
  }, []);

  useEffect(() => {
    if (shouldRedirectEmptyCreate) {
      router.replace('/catalog' as any);
    }
  }, [shouldRedirectEmptyCreate]);

  const renderDiscoverySections = useCallback(
    (dimensions: FilterDimensionOption[], emptyMessage: string) => {
      if (dimensions.length === 0) {
        return <AppText variant="body" tone="muted">{emptyMessage}</AppText>;
      }

      return dimensions.map((dimension) => {
        const help = getDiscoveryDimensionHelp(dimension.slug);
        const values = [...dimension.values].sort((a, b) => {
          const orderDelta = (a.order ?? 0) - (b.order ?? 0);
          return orderDelta || a.name.localeCompare(b.name);
        });

        return (
          <View key={dimension.id} style={styles.sheetSection}>
            <View style={styles.sheetSectionHeader}>
              <AppText variant="bodyBold">{getDiscoveryDimensionLabel(dimension.slug, dimension.name)}</AppText>
              {help ? (
                <AppText variant="captionRegular" tone="muted">
                  {help}
                </AppText>
              ) : null}
            </View>
            {values.length > 0 ? (
              <View style={styles.sheetChipWrap}>
                {values.map((value) => (
                  <Chip
                    key={value.id}
                    label={value.name}
                    selected={(filterSelection[dimension.id] ?? []).includes(value.id)}
                    onPress={() => toggleFilterValue(dimension.id, value.id, dimension.isMulti)}
                  />
                ))}
              </View>
            ) : (
              <AppText variant="body" tone="muted">
                No options available yet.
              </AppText>
            )}
          </View>
        );
      });
    },
    [filterSelection, toggleFilterValue],
  );

  if (booting && isEditMode) {
    return <AppLoaderScreen message="Loading composer" />;
  }

  return (
    <KeyboardAvoidingView 
      style={styles.flex} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={styles.header}>
          <AppBackButton fallbackHref="/catalog" />
          <View style={styles.headerCopy}>
            <AppText variant="title">Create design</AppText>
            <AppText variant="captionRegular" tone="muted">
              Edit the required fields, then preview.
            </AppText>
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            // Extra bottom room while the keyboard is up so the focused field can
            // scroll clear of the keyboard instead of sitting behind it.
            keyboardHeight > 0 ? { paddingBottom: tokens.spacing.md + keyboardHeight } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.mediaSection}>
            <View style={styles.sectionTopRow}>
              <View style={styles.sectionTitleCopy}>
                <AppText variant="bodyBold">Selected media</AppText>
                <AppText
                  variant="captionRegular"
                  tone={missingRequiredMediaSlots.length > 0 || assets.length === 0 ? 'danger' : 'muted'}
                >
                  {assets.length === 0
                      ? 'Required: add Front, Back, Left Side, and Right Side'
                      : missingRequiredMediaSlots.length > 0
                        ? `Required: add ${missingRequiredMediaSlots.map(getMediaViewSlotLabel).join(', ')}`
                        : `${assets.length}/${DESIGN_EDITOR_MAX_MEDIA} selected`}
                </AppText>
              </View>
              <View ref={mediaAnchorRef} onLayout={captureMediaAnchorMetrics} collapsable={false}>
                <Button title="+" size="sm" variant="ghost" onPress={openMediaMenu} />
              </View>
            </View>
            {assets.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                {assets.map((asset, index) => (
                  <View key={asset.id} style={styles.assetCard}>
                    <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.assetPreview} imageStyle={styles.assetPreview} />
                    <View style={[styles.assetBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                      <AppText variant="captionBold">
                        {asset.viewSlot ? getMediaViewSlotLabel(asset.viewSlot) : DESIGN_MEDIA_SLOTS[index]}
                      </AppText>
                    </View>
                    <View style={styles.assetActionRow}>
                      <Pressable onPress={() => setCoverAssetId(asset.id)}>
                        <AppText variant="captionBold" tone={asset.id === coverAssetId ? 'muted' : 'primary'}>Set Cover</AppText>
                      </Pressable>
                      <Pressable onPress={() => removeAsset(asset.id)}>
                        <AppText variant="captionBold" tone="danger">Remove</AppText>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {missingRequiredFields.length > 0 && canSaveDraft ? (
            <Card padding="md" style={[styles.formCard, { borderColor: theme.colors.danger, backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="bodyBold" tone="danger">Missing required fields</AppText>
              <AppText variant="captionRegular" tone="muted" style={{ marginTop: tokens.spacing.xs }}>
                {missingRequiredFields.join(' • ')}
              </AppText>
            </Card>
          ) : null}

          <Card padding="lg" style={[styles.formCard, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold" style={styles.sectionHeaderTitle}>Basic details</AppText>
            <View style={styles.copyBlock}>
              <RequiredFieldLabel required>Title</RequiredFieldLabel>
              <Input
                label="Title"
                hideLabel
                variant="bare"
                value={form.title}
                onChangeText={(value) => updateField('title', value)}
                placeholder="Title"
                containerStyle={styles.copyField}
              />
              <View style={[styles.copyDivider, { backgroundColor: theme.colors.border }]} />
              <RequiredFieldLabel>Description</RequiredFieldLabel>
              <Input
                label="Description"
                hideLabel
                variant="bare"
                value={form.description}
                onChangeText={(value) => updateField('description', value)}
                placeholder="Description"
                multiline
                containerStyle={styles.copyField}
              />
            </View>
          </Card>

          <Card padding="lg" style={[styles.formCard, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold" style={styles.sectionHeaderTitle}>Categorization</AppText>
            <OptionRow
              leading="🏷️"
              title="What is it?"
              required
              subtitle="Choose the garment or item family."
              value={categoryValue}
              valueTone={form.categoryId ? 'muted' : 'danger'}
              onPress={() => openCategorySheet('category')}
            />
            <OptionRow
              leading="💸"
              title="Garment type"
              required
              subtitle="Choose the specific garment type."
              value={garmentTypeValue}
              valueTone={form.subCategoryId ? 'muted' : 'danger'}
              onPress={() => openCategorySheet('subcategory')}
            />
            <OptionRow
              leading="⚙️"
              title="Hashtags"
              required
              subtitle="Add searchable social tags."
              value={selectedTags.length > 0 ? `${selectedTags.length} selected` : 'Select'}
              valueTone={selectedTags.length > 0 ? 'muted' : 'danger'}
              divider={false}
              onPress={() => setTagsOpen(true)}
            />
            {selectedTags.length > 0 ? (
              <View style={styles.selectedTagPreview}>
                {selectedTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={normalizeHashtagLabel(tag)}
                    selected
                    onPress={() => {
                      updateField('tagsInput', selectedTags.filter((entry) => entry !== tag).join(', '));
                    }}
                  />
                ))}
              </View>
            ) : null}
          </Card>

          <Card padding="lg" style={[styles.formCard, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold" style={styles.sectionHeaderTitle}>Audience & Style</AppText>
            <OptionRow
              title="Who is it for?"
              subtitle="Helps buyers discover styles that fit them."
              value={audienceLabel}
              onPress={() => setAudienceOpen(true)}
            />
            <OptionRow
              title="Age group"
              subtitle="Choose whether this is designed for adults or kids."
              value={targetAgeLabel}
              onPress={() => setAgeGroupOpen(true)}
            />
            <OptionRow
              title="Style details"
              required
              subtitle="Style, fabric, color family, and fit."
              value={styleDetailsCount > 0 ? `${styleDetailsCount} selected` : selectedDiscoveryFilterCount > 0 ? 'Optional' : 'Select'}
              valueTone={selectedDiscoveryFilterCount > 0 ? 'muted' : 'danger'}
              onPress={() => setStyleDetailsOpen(true)}
            />
            <OptionRow
              title="Cultural vibe"
              subtitle="Heritage signals like Ankara, Aso Ebi, or Adire."
              value={heritageCount > 0 ? `${heritageCount} selected` : 'Optional'}
              onPress={() => setHeritageOpen(true)}
            />
            <OptionRow
              title="Where would you wear it?"
              subtitle="Wedding, office, party, church, or everyday wear."
              value={occasionCount > 0 ? `${occasionCount} selected` : 'Optional'}
              divider={false}
              onPress={() => setOccasionOpen(true)}
            />
          </Card>

          <Card padding="lg" style={[styles.formCard, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold" style={styles.sectionHeaderTitle}>Availability & Pricing</AppText>
            <OptionRow
              title="Price"
              value={formatPriceSummary(form.minPrice, form.maxPrice)}
              onPress={() => setPriceOpen(true)}
            />
            <OptionRow
              leading="📦"
              title="Availability"
              subtitle={`${sizingLabel} · ${fitPreferenceLabel}`}
              value={availabilityLabel}
              onPress={() => setAvailabilityOpen(true)}
            />
            <OptionRow
              leading="🧵"
              title="Custom orders"
              subtitle={
                form.customOrderEnabled
                  ? customOrderNeedsAttention
                    ? 'Fix custom order details to continue'
                    : `${customMeasurementKeys.length} field${customMeasurementKeys.length === 1 ? '' : 's'}`
                  : 'Off'
              }
              value={form.customOrderEnabled ? 'Enabled' : 'Disabled'}
              valueTone={customOrderNeedsAttention ? 'danger' : undefined}
              onPress={() => setCustomOrdersOpen(true)}
            />
            <OptionRow
              leading="🌍"
              title="Who can see this?"
              value={PRIVACY_OPTIONS.find((entry) => entry.value === form.visibility)?.label ?? 'Everyone'}
              divider={false}
              onPress={() => setPrivacyOpen(true)}
            />
          </Card>

          {loadingError ? (
            <Card padding="md" style={[styles.requiredCard, { borderColor: theme.colors.border }]}>
              <AppText variant="bodyBold">Metadata could not fully load</AppText>
              <AppText variant="captionRegular" tone="muted">
                {loadingError}
              </AppText>
              <Button title="Retry metadata" size="sm" variant="secondary" onPress={() => void retryBootstrap()} />
            </Card>
          ) : null}

        </ScrollView>
        <View
          style={[
            styles.footerActions,
            {
              backgroundColor: theme.colors.bg,
              borderTopColor: theme.colors.border,
              paddingBottom: keyboardHeight > 0 && Platform.OS === 'ios'
                ? tokens.spacing.lg // keyboard covers the safe area
                : Math.max(insets.bottom + tokens.spacing.lg, tokens.spacing['2xl']),
              paddingHorizontal: tokens.spacing.lg,
            },
          ]}
        >
          {!canSaveDraft ? (
            <AppText variant="captionRegular" tone="muted" style={styles.draftHelper}>
              Add at least one field or one media item to save a draft.
            </AppText>
          ) : !canPreview ? (
            <AppText variant="captionRegular" tone="danger" style={styles.draftHelper}>
              Required: {missingRequiredFields[0]} {missingRequiredFields.length > 1 ? `(+${missingRequiredFields.length - 1} more)` : ''}
            </AppText>
          ) : null}
          <View style={styles.actionRow}>
            <View style={styles.actionButton}>
              <Button
                title={saveState.action === 'draft' ? 'Saving draft...' : 'Save draft'}
                variant="secondary"
                loading={saveState.action === 'draft'}
                disabled={!canSaveDraft || Boolean(saveState.action)}
                onPress={() => void save('draft')}
                fullWidth
              />
            </View>
            <View style={styles.actionButton}>
              <Button
                title="Preview"
                disabled={!canPreview}
                onPress={() => router.push('/catalog/create-design/preview' as any)}
                fullWidth
              />
            </View>
          </View>
        </View>

      {renderSheets ? (
        <>
          <AppSelectSheet
            visible={privacyOpen}
        title="Who can see this?"
        subtitle={CREATOR_METADATA_HELP.visibility}
        options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={form.visibility}
        onChange={(value) => updateField('visibility', value as 'PUBLIC' | 'PRIVATE')}
        onClose={() => setPrivacyOpen(false)}
      />

      <AppBottomSheet
        visible={categoryOpen}
        title={categoryStep === 'category' ? 'What is it?' : 'Garment type'}
        subtitle={categoryStep === 'category' ? 'Choose the garment or item family.' : 'Choose the specific garment type.'}
        onClose={closeCategorySheet}
        onDone={handleCategoryDone}
        doneLabel="Use selection"
        doneDisabled={!draftSelectedCategory || (draftSubCategories.length > 0 && !draftSubCategoryId)}
        showCloseButton
      >
        {categoryStep === 'subcategory' && draftSelectedCategory ? (
          <Pressable onPress={() => setCategoryStep('category')} style={styles.sheetBackRow}>
            <AppText variant="captionBold" tone="primary">&lt; Change item family</AppText>
          </Pressable>
        ) : null}
        <View style={styles.optionCardList}>
          {(categoryStep === 'category' ? categoryOptions : draftSubCategories.map((subCategory) => ({
            value: subCategory.id,
            label: subCategory.name,
          }))).map((option) => {
            const selected = categoryStep === 'category'
              ? option.value === draftCategoryId
              : option.value === draftSubCategoryId;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  if (categoryStep === 'category') {
                    setDraftCategoryId(option.value);
                    setDraftSubCategoryId('');
                    setCategoryStep('subcategory');
                    return;
                  }
                  setDraftSubCategoryId(option.value);
                }}
                style={({ pressed }) => [
                  styles.categoryOption,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed ? styles.optionPressed : null,
                ]}
              >
                <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {categoryStep === 'category' && categoryOptions.length === 0 ? (
          <AppText variant="body" tone="muted">No item families are configured yet.</AppText>
        ) : null}
        {categoryStep === 'subcategory' && draftSelectedCategory && draftSubCategories.length === 0 ? (
          <Card padding="md" style={[styles.inlineNotice, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">No garment types yet</AppText>
            <AppText variant="captionRegular" tone="muted">
              You can save a draft with this item family. Going live requires a configured garment type.
            </AppText>
          </Card>
        ) : null}
      </AppBottomSheet>

      <AppMultiSelectSheet
        visible={tagsOpen}
        title="Hashtags"
        subtitle={CREATOR_METADATA_HELP.hashtags}
        options={tagOptions}
        values={selectedTags}
        onChange={(values) => {
          updateField('tagsInput', values.join(', '));
        }}
        onClose={() => setTagsOpen(false)}
        emptyMessage="No suggestions found. Type a hashtag and tap Add."
        errorMessage={tagError}
        loading={tagsLoading}
        onRetry={() => void loadTags(() => true, { forceRefresh: true })}
        maxSelected={10}
        popularLabel="Popular Hashtags:"
        searchInputLabel="Search hashtags"
        searchPlaceholder="Search or create a hashtag..."
        searchEmptyMessage="No suggestions found. Type a hashtag and tap Add."
        customInputLabel="Custom hashtag"
        customPlaceholder="Add custom hashtag"
      />

      <AppBottomSheet
        visible={priceOpen}
        title="Price range"
        subtitle="Set the indicative range buyers will see."
        onClose={() => setPriceOpen(false)}
        showCloseButton
        footer={
          <View style={styles.sheetActionRow}>
            <View style={styles.actionButton}>
              <Button title="Cancel" variant="outline" onPress={() => setPriceOpen(false)} fullWidth />
            </View>
            <View style={styles.actionButton}>
              <Button title="Done" disabled={Boolean(priceError)} onPress={() => setPriceOpen(false)} fullWidth />
            </View>
          </View>
        }
      >
        <View style={[styles.priceSummaryCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted">Displayed price</AppText>
          <AppText variant="subtitle">{formatPriceSummary(form.minPrice, form.maxPrice)}</AppText>
        </View>
        <View style={styles.priceRow}>
          <Input
            label="Minimum"
            value={form.minPrice}
            onChangeText={(value) => updateField('minPrice', value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.priceInput}
          />
          <Input
            label="Maximum"
            value={form.maxPrice}
            onChangeText={(value) => updateField('maxPrice', value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.priceInput}
          />
        </View>
        {priceError ? (
          <AppText variant="captionRegular" tone="danger">{priceError}</AppText>
        ) : (
          <AppText variant="captionRegular" tone="muted">
            Leave either field empty if the design only needs a starting or maximum reference price.
          </AppText>
        )}
      </AppBottomSheet>

      <AppBottomSheet
        visible={availabilityOpen}
        title="Availability"
        subtitle="Set sizing and fit expectations."
        onClose={() => setAvailabilityOpen(false)}
        showCloseButton
      >
        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Sizing mode</AppText>
          <View style={styles.sheetChipWrap}>
            {DESIGN_CREATION_SIZING_OPTIONS.map((value) => (
              <Chip
                key={value}
                label={DESIGN_SIZING_LABELS[value]}
                selected={form.sizingMode === value}
                onPress={() => {
                  updateField('sizingMode', value);
                  updateField('customOrderEnabled', value === 'CUSTOM');
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Fit preference</AppText>
          <View style={styles.sheetChipWrap}>
            {(['SLIM', 'REGULAR', 'LOOSE', 'OVERSIZED'] as const).map((value) => (
              <Chip key={value} label={DESIGN_FIT_PREFERENCE_LABELS[value]} selected={form.fitPreference === value} onPress={() => updateField('fitPreference', value)} />
            ))}
          </View>
        </View>

      </AppBottomSheet>

      <AppBottomSheet
        visible={customOrdersOpen}
        title="Custom orders"
        subtitle="Expose every required field buyers must provide."
        onClose={() => setCustomOrdersOpen(false)}
        showCloseButton
        scrollable
      >
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <AppText variant="bodyBold">Accept custom orders</AppText>
            <AppText variant="captionRegular" tone="muted">
              Buyers can request this design as a custom job.
            </AppText>
          </View>
          <Switch
            value={form.customOrderEnabled}
            onValueChange={(value) => {
              updateField('customOrderEnabled', value);
              updateField('sizingMode', value ? 'CUSTOM' : 'NONE');
            }}
          />
        </View>

        {form.customOrderEnabled ? (
          <View style={styles.sheetSection}>
            <RequiredFieldLabel required>Required custom-order fields</RequiredFieldLabel>
            <AppText variant="captionRegular" tone="muted">
              Select the exact buyer measurement fields for this design.
            </AppText>
            <View style={styles.sheetChipWrap}>
              {measurementPoints.length > 0 ? measurementPoints.map((point) => (
                <Chip
                  key={point.key}
                  label={point.label || point.key}
                  selected={customMeasurementKeys.includes(point.key)}
                  onPress={() => toggleMeasurementKey(point.key)}
                />
              )) : (
                <AppText variant="body" tone="muted">
                  No measurement fields are available for this audience.
                </AppText>
              )}
            </View>
            <View style={styles.priceRow}>
              <Input
                label="Base charge"
                value={form.baseProductionCharge}
                onChangeText={(value) => updateField('baseProductionCharge', value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="5000"
                containerStyle={styles.priceInput}
                error={customOrderFieldErrors.baseCharge ?? undefined}
              />
              <Input
                label="Fabric cost / yard"
                value={form.fabricCostPerYard}
                onChangeText={(value) => updateField('fabricCostPerYard', value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="2500"
                containerStyle={styles.priceInput}
                error={customOrderFieldErrors.fabricCost ?? undefined}
              />
            </View>
            <View style={[styles.switchRow, { marginTop: tokens.spacing.md }]}>
              <View style={styles.switchCopy}>
                <AppText variant="bodyBold">Rush orders</AppText>
                <AppText variant="captionRegular" tone="muted">
                  Allow buyers to pay extra for faster production.
                </AppText>
              </View>
              <Switch
                value={form.rushEnabled}
                onValueChange={(value) => updateField('rushEnabled', value)}
              />
            </View>
            {form.rushEnabled ? (
              <View style={styles.priceRow}>
                <Input
                  label="Rush fee"
                  value={form.rushFee}
                  onChangeText={(value) => updateField('rushFee', value.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="2000"
                  containerStyle={styles.priceInput}
                  error={customOrderFieldErrors.rushFee ?? undefined}
                />
                <Input
                  label="Rush time"
                  value={form.rushProductionLeadDays}
                  onChangeText={(value) => updateField('rushProductionLeadDays', value.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder="5"
                  containerStyle={styles.priceInput}
                  helperText="5–13 days, shorter than production time."
                  error={customOrderFieldErrors.rushTime ?? undefined}
                />
              </View>
            ) : null}
            <View style={styles.priceRow}>
              <Input
                label="Delivery min days"
                value={form.deliveryMinDays}
                onChangeText={(value) => updateField('deliveryMinDays', value.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="2"
                containerStyle={styles.priceInput}
              />
              <Input
                label="Delivery max days"
                value={form.deliveryMaxDays}
                onChangeText={(value) => updateField('deliveryMaxDays', value.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="5"
                containerStyle={styles.priceInput}
              />
            </View>
            <Input
              label="Production time"
              value={form.productionLeadDays}
              onChangeText={(value) => updateField('productionLeadDays', value.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              placeholder="14"
              helperText="Days to produce the custom order."
            />
            <Input
              label="Fallback yards"
              value={form.fallbackOutputYards}
              onChangeText={(value) => updateField('fallbackOutputYards', value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="4"
              error={customOrderFieldErrors.fallbackYards ?? undefined}
            />
            <Input
              label="Delivery scope"
              value={form.deliveryScope}
              onChangeText={(value) => updateField('deliveryScope', value)}
              placeholder="Nigeria"
            />
            <Input
              label="Additional instructions"
              value={form.buyerInstructionText}
              onChangeText={(value) => updateField('buyerInstructionText', value)}
              multiline
              placeholder="Any special instructions for buyers..."
            />
            <Input
              label="Private notes"
              value={form.notes}
              onChangeText={(value) => updateField('notes', value)}
              multiline
              placeholder="Internal notes about this configuration..."
            />
            <Input
              label="Revision policy"
              value={form.revisionPolicy}
              onChangeText={(value) => updateField('revisionPolicy', value)}
              multiline
            />
            <Input
              label="Return policy"
              value={form.returnPolicy}
              onChangeText={(value) => updateField('returnPolicy', value)}
              multiline
            />
            <Input
              label="Defect policy"
              value={form.defectPolicy}
              onChangeText={(value) => updateField('defectPolicy', value)}
              multiline
            />
          </View>
        ) : null}
      </AppBottomSheet>

      <AppSelectSheet
        visible={audienceOpen}
        title="Who is it for?"
        subtitle={CREATOR_METADATA_HELP.audience}
        options={CREATOR_AUDIENCE_OPTIONS}
        value={form.audience}
        onChange={(value) => updateField('audience', value as typeof form.audience)}
        onClose={() => setAudienceOpen(false)}
      />

      <AppSelectSheet
        visible={ageGroupOpen}
        title="Age group"
        subtitle="Choose whether this design is made for adults or kids."
        options={TARGET_AGE_OPTIONS}
        value={form.targetAgeGroup}
        onChange={(value) => updateField('targetAgeGroup', value as typeof form.targetAgeGroup)}
        onClose={() => setAgeGroupOpen(false)}
      />

      <AppBottomSheet
        visible={styleDetailsOpen}
        title="Style details"
        subtitle={CREATOR_METADATA_HELP.style}
        onClose={() => setStyleDetailsOpen(false)}
        showCloseButton
      >
        {() => renderDiscoverySections(styleDetailDimensions, 'Style details could not load. You can still save a draft.')}
      </AppBottomSheet>

      <AppBottomSheet
        visible={heritageOpen}
        title="Cultural vibe"
        subtitle={CREATOR_METADATA_HELP.heritage}
        onClose={() => setHeritageOpen(false)}
        showCloseButton
      >
        {() => renderDiscoverySections(heritageDimensions, 'Cultural vibe options could not load. You can still save a draft.')}
      </AppBottomSheet>

      <AppBottomSheet
        visible={occasionOpen}
        title="Where would you wear it?"
        subtitle={CREATOR_METADATA_HELP.occasion}
        onClose={() => setOccasionOpen(false)}
        showCloseButton
      >
        {() => renderDiscoverySections(occasionDimensions, 'Occasion options could not load. You can still save a draft.')}
      </AppBottomSheet>

      <AppFloatingMenu
        visible={mediaOpen}
        anchorRef={mediaAnchorRef}
        anchorMetrics={mediaAnchorMetrics}
        options={mediaMenuOptions}
        onClose={() => setMediaOpen(false)}
      />

      <AppBottomSheet
        visible={Boolean(permissionIssue)}
        title={permissionIssue?.title}
        subtitle={permissionIssue?.message}
        onClose={clearPermissionIssue}
        showCloseButton
        footer={
          <View style={styles.permissionActions}>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => {
                const source = permissionIssue?.source;
                clearPermissionIssue();
                if (source) void handlePickMedia(source);
              }}
            />
            <Button title="Open settings" onPress={() => void openMediaPermissionSettings()} />
          </View>
        }
      >
        <AppText variant="body" tone="muted">
          You can close this sheet and tap Camera or Select from library again at any time.
        </AppText>
      </AppBottomSheet>
      </>
      ) : null}
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
  },
  sectionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    minHeight: tokens.button.sm.height,
  },
  sectionTitleCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  mediaSection: {
    gap: tokens.spacing.md,
  },
  mediaStrip: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
  },
  assetCard: {
    width: 172,
    gap: tokens.spacing.sm,
  },
  assetPreview: {
    width: 172,
    height: 224,
    borderRadius: tokens.radius.xl,
  },
  assetBadge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  assetActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },

  formCard: {
    gap: tokens.spacing.md,
    borderWidth: 1,
  },
  copyBlock: {
    marginTop: tokens.spacing.xs,
  },
  sectionHeaderTitle: {
    marginBottom: tokens.spacing.md,
    color: tokens.colors.primary,
  },
  copyField: {
    paddingVertical: tokens.spacing.xs,
  },
  copyDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  quickChipRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  selectedTagPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
  },

  requiredCard: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
  },
  requiredList: {
    gap: tokens.spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  priceSummaryCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
  },
  priceInput: {
    flex: 1,
  },
  sheetSection: {
    gap: tokens.spacing.sm,
  },
  sheetSectionHeader: {
    gap: tokens.spacing.xs,
  },
  sheetChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  permissionActions: {
    gap: tokens.spacing.sm,
  },
  optionCardList: {
    gap: tokens.spacing.sm,
  },
  categoryOption: {
    minHeight: tokens.button.md.height,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  optionPressed: {
    opacity: 0.76,
  },
  sheetBackRow: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xs,
  },
  inlineNotice: {
    borderWidth: 1,
    gap: tokens.spacing.xs,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'stretch',
  },
  footerActions: {
    gap: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
  },
  draftHelper: {
    textAlign: 'center',
  },
});


