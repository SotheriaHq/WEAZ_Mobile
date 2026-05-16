import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';

import {
  getDesignCategories,
  getDesignDetail,
  getDesignFilterDimensions,
  getActiveDesignCustomConfiguration,
  getMeasurementPoints,
  deleteDesign,
  saveDesignEditor,
  startDesignDraftSession,
  type DesignCustomOrderConfigurationInput,
  type DesignCustomOrderConfiguration,
  type DesignCategoryOption,
  type DesignDetail,
  type DesignEditorAsset,
  type DesignFilterSelection,
  type DraftSessionResponse,
  type FilterDimensionOption,
  type MeasurementPointOption,
} from '@/src/api/DesignApi';
import { useAuthSession } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import {
  getSelectedFilterValueIds,
  isLegacyDiscoveryDimensionSlug,
  mapCreatorMetadataError,
} from '@/src/utils/creatorMetadata';
import { routeForDesignTarget } from '@/src/utils/mobileRouting';
import {
  consumeDesignEditorAssetBundle,
  DESIGN_EDITOR_MAX_MEDIA,
  pickDesignEditorMediaAssets,
  type MediaPermissionIssue,
} from './designEditorMediaFlow';
import { DESIGN_REQUIRED_MEDIA_COUNT } from './designCreationRules';

type Visibility = 'PUBLIC' | 'PRIVATE';
type Audience = 'MALE' | 'FEMALE' | 'EVERYBODY';
type SizingMode = 'NONE' | 'RTW' | 'CUSTOM' | 'RTW_PLUS_FITTINGS';
type FitPreference = 'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED';
type TargetAgeGroup = 'ADULT' | 'CHILD';

type FormState = {
  title: string;
  description: string;
  tagsInput: string;
  visibility: Visibility;
  audience: Audience;
  categoryId: string;
  subCategoryId: string;
  minPrice: string;
  maxPrice: string;
  sizingMode: SizingMode;
  customOrderEnabled: boolean;
  productionLeadDays: string;
  buyerInstructionText: string;
  baseProductionCharge: string;
  fabricCostPerYard: string;
  deliveryMinDays: string;
  deliveryMaxDays: string;
  deliveryScope: string;
  revisionPolicy: string;
  returnPolicy: string;
  defectPolicy: string;
  fabricSourcingMode: 'BRAND_SOURCED' | 'BUYER_SUPPLIED' | 'EITHER';
  fallbackOutputYards: string;
  fitPreference: FitPreference;
  targetAgeGroup: TargetAgeGroup;
};

type SaveAction = 'draft' | 'publish';
type ContextValue = {
  booting: boolean;
  loadingError: string | null;
  draftConflict: DraftSessionResponse | null;
  categories: DesignCategoryOption[];
  filterDimensions: FilterDimensionOption[];
  measurementPoints: MeasurementPointOption[];
  customOrderConfigurations: DesignCustomOrderConfiguration[];
  selectedCustomOrderConfigurationId: string;
  form: FormState;
  assets: DesignEditorAsset[];
  coverAssetId: string | null;
  filterSelection: DesignFilterSelection;
  customMeasurementKeys: string[];
  originalMediaIds: string[];
  activeDesignId: string | null;
  isEditMode: boolean;
  isDraft: boolean;
  saveState: {
    action: SaveAction | null;
    progress: number;
    message: string;
  };
  permissionIssue: MediaPermissionIssue | null;
  selectedCategory: DesignCategoryOption | null;
  subCategories: DesignCategoryOption['subCategories'];
  tags: string[];
  canSaveDraft: boolean;
  canPublish: boolean;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setFilterSelection: React.Dispatch<React.SetStateAction<DesignFilterSelection>>;
  toggleFilterValue: (dimensionId: string, valueId: string, isMulti: boolean) => void;
  toggleMeasurementKey: (key: string) => void;
  selectCustomOrderConfiguration: (configurationId: string) => void;
  pickMedia: (source?: 'camera' | 'library') => Promise<boolean>;
  clearPermissionIssue: () => void;
  openMediaPermissionSettings: () => Promise<void>;
  removeAsset: (assetId: string) => void;
  setCoverAssetId: (assetId: string | null) => void;
  save: (action: SaveAction) => Promise<void>;
  deleteDraft: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  takeOverDraftConflict: () => Promise<void>;
};

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  tagsInput: '',
  visibility: 'PUBLIC',
  audience: 'EVERYBODY',
  categoryId: '',
  subCategoryId: '',
  minPrice: '',
  maxPrice: '',
  sizingMode: 'RTW_PLUS_FITTINGS',
  customOrderEnabled: false,
  productionLeadDays: '',
  buyerInstructionText: '',
  baseProductionCharge: '',
  fabricCostPerYard: '',
  deliveryMinDays: '2',
  deliveryMaxDays: '5',
  deliveryScope: 'Nigeria',
  revisionPolicy: 'One revision after delivery confirmation.',
  returnPolicy: 'Custom orders are not returnable except where required by policy.',
  defectPolicy: 'Defects and material faults are reviewed through support.',
  fabricSourcingMode: 'BRAND_SOURCED',
  fallbackOutputYards: '4',
  fitPreference: 'REGULAR',
  targetAgeGroup: 'ADULT',
};

const DesignEditorContext = createContext<ContextValue | null>(null);

function parseTags(input: string): string[] {
  const tags = input
    .split(',')
    .map((value) => value.trim().replace(/^#/, ''))
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 10);
}

function syncFormFromDetail(detail: DesignDetail): FormState {
  return {
    title: detail.title ?? '',
    description: detail.description ?? '',
    tagsInput: Array.isArray(detail.tags) ? detail.tags.join(', ') : '',
    visibility: detail.visibility,
    audience: detail.type,
    categoryId: detail.categoryId ?? '',
    subCategoryId: detail.subCategoryId ?? '',
    minPrice: typeof detail.minPrice === 'number' ? String(detail.minPrice) : '',
    maxPrice: typeof detail.maxPrice === 'number' ? String(detail.maxPrice) : '',
    sizingMode: detail.sizingMode,
    customOrderEnabled: detail.customOrderEnabled,
    productionLeadDays: '',
    buyerInstructionText: '',
    baseProductionCharge: '',
    fabricCostPerYard: '',
    deliveryMinDays: '2',
    deliveryMaxDays: '5',
    deliveryScope: 'Nigeria',
    revisionPolicy: 'One revision after delivery confirmation.',
    returnPolicy: 'Custom orders are not returnable except where required by policy.',
    defectPolicy: 'Defects and material faults are reviewed through support.',
    fabricSourcingMode: 'BRAND_SOURCED',
    fallbackOutputYards: '4',
    fitPreference: detail.fitPreference ?? 'REGULAR',
    targetAgeGroup: detail.targetAgeGroup ?? 'ADULT',
  };
}

function syncAssetsFromDetail(detail: DesignDetail): DesignEditorAsset[] {
  return detail.medias.map((media, index) => ({
    id: media.id || `existing-${index}`,
    uri: media.previewUrl ?? media.url ?? '',
    mimeType: media.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
    fileName: `${media.mediaType}-${index + 1}`,
    fileSize: 0,
    mediaKind: media.mediaType,
    existingMediaId: media.id,
    remoteFileId: media.fileId ?? null,
    remoteUrl: media.previewUrl ?? media.url ?? null,
    aspectRatio: media.aspectRatio ?? null,
  }));
}

function measurementGenderForAudience(audience: Audience): 'MEN' | 'WOMEN' | 'UNISEX' | undefined {
  if (audience === 'MALE') return 'MEN';
  if (audience === 'FEMALE') return 'WOMEN';
  return undefined;
}

function hasMeaningfulDraftContent(form: FormState, tags: string[], filterSelection: DesignFilterSelection) {
  if (form.title.trim().length > 0) return true;
  if (form.description.trim().length > 0) return true;
  if (tags.length > 0) return true;
  if (Boolean(form.categoryId) || Boolean(form.subCategoryId)) return true;
  if (form.minPrice.trim().length > 0 || form.maxPrice.trim().length > 0) return true;
  if (form.visibility !== 'PUBLIC') return true;
  if (form.audience !== 'EVERYBODY') return true;
  if (form.sizingMode !== 'RTW_PLUS_FITTINGS') return true;
  if (form.customOrderEnabled) return true;
  if (form.productionLeadDays.trim().length > 0) return true;
  if (form.buyerInstructionText.trim().length > 0) return true;
  if (form.baseProductionCharge.trim().length > 0) return true;
  if (form.fabricCostPerYard.trim().length > 0) return true;
  if (form.fitPreference !== 'REGULAR') return true;
  if (form.targetAgeGroup !== 'ADULT') return true;
  return Object.values(filterSelection).some((values) => values.length > 0);
}

function getPublishValidationMessage({
  assetsCount,
  form,
  tags,
  filterValueIds,
  customMeasurementKeys,
}: {
  assetsCount: number;
  form: FormState;
  tags: string[];
  filterValueIds: string[];
  customMeasurementKeys: string[];
}) {
  if (assetsCount === 0) return 'Add Front, Back, Left, and Right media before previewing.';
  if (assetsCount < DESIGN_REQUIRED_MEDIA_COUNT) return 'Add Front, Back, Left, and Right media before previewing.';
  if (assetsCount > DESIGN_EDITOR_MAX_MEDIA) return 'Remove extra media before previewing.';
  if (form.title.trim().length === 0) return 'Add a title before previewing.';
  if (!form.categoryId) return 'Choose what this item is.';
  if (!form.subCategoryId) return 'Choose a garment type.';
  if (!form.audience) return 'Choose who this item is for.';
  if (!form.targetAgeGroup) return 'Choose an age group.';
  if (filterValueIds.length === 0) return 'Add at least one style detail.';
  if (tags.length === 0) return 'Add at least one hashtag.';
  if (form.customOrderEnabled && customMeasurementKeys.length === 0) return 'Choose required custom-order fields.';
  if (
    form.customOrderEnabled &&
    (!form.baseProductionCharge.trim() || !form.fabricCostPerYard.trim() || !form.fallbackOutputYards.trim())
  ) {
    return 'Add custom-order pricing before previewing.';
  }
  return null;
}

function extractApiErrorMessage(error: any, fallback: string) {
  const responseData = error?.response?.data;
  const responseMessage = responseData?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.join(', ');
  }

  if (typeof responseMessage === 'string') {
    return responseMessage;
  }

  if (responseMessage && typeof responseMessage === 'object' && typeof responseMessage.message === 'string') {
    return responseMessage.message;
  }

  if (typeof responseData?.error === 'string') {
    return responseData.error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function DesignEditorProvider({
  designId,
  assetHandoffToken,
  children,
}: {
  designId?: string;
  assetHandoffToken?: string;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const { hasActiveBrandMembership, userEmailVerified } = useAuthSession();
  const [booting, setBooting] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [draftConflict, setDraftConflict] = useState<DraftSessionResponse | null>(null);
  const [categories, setCategories] = useState<DesignCategoryOption[]>([]);
  const [filterDimensions, setFilterDimensions] = useState<FilterDimensionOption[]>([]);
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPointOption[]>([]);
  const [customOrderConfigurations, setCustomOrderConfigurations] = useState<DesignCustomOrderConfiguration[]>([]);
  const [selectedCustomOrderConfigurationId, setSelectedCustomOrderConfigurationId] = useState('');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [assets, setAssets] = useState<DesignEditorAsset[]>([]);
  const [coverAssetId, setCoverAssetIdState] = useState<string | null>(null);
  const [filterSelection, setFilterSelection] = useState<DesignFilterSelection>({});
  const [customMeasurementKeys, setCustomMeasurementKeys] = useState<string[]>([]);
  const [originalMediaIds, setOriginalMediaIds] = useState<string[]>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(designId ?? null);
  const [activeDesignStatus, setActiveDesignStatus] = useState<'DRAFT' | 'PUBLISHED'>(designId ? 'DRAFT' : 'DRAFT');
  const [draftSessionToken, setDraftSessionToken] = useState<string | undefined>(undefined);
  const [draftVersion, setDraftVersion] = useState<number | undefined>(undefined);
  const [saveAction, setSaveAction] = useState<SaveAction | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState('');
  const [permissionIssue, setPermissionIssue] = useState<MediaPermissionIssue | null>(null);

  const bootstrappedRef = useRef(false);
  const normalizedAssetHandoffToken = assetHandoffToken?.trim() || undefined;

  const hydrateFromDetail = useCallback((detail: DesignDetail) => {
    setForm(syncFormFromDetail(detail));
    setFilterSelection(detail.filterSelection ?? {});
    setCustomMeasurementKeys(detail.customMeasurementKeys ?? []);
    setAssets(syncAssetsFromDetail(detail));
    setCoverAssetIdState(detail.coverMediaId ?? null);
    setOriginalMediaIds(detail.medias.map((media) => media.id));
    setDraftVersion(detail.draftVersion);
    setActiveDesignId(detail.id);
    setActiveDesignStatus(detail.status);
  }, []);

  const loadMeasurementPoints = useCallback(async (audience: Audience) => {
    try {
      const gender = measurementGenderForAudience(audience);
      const points = await getMeasurementPoints(gender ? { gender } : undefined);
      setMeasurementPoints(points);
    } catch {
      setMeasurementPoints([]);
    }
  }, []);

  const loadBootstrap = useCallback(
    async (forceTakeOver = false) => {
      setBooting(true);
      setLoadingError(null);
      try {
        const [categoriesResult, filtersResult] = await Promise.allSettled([
          getDesignCategories(),
          getDesignFilterDimensions(),
        ]);

        const metadataWarnings: string[] = [];

        if (categoriesResult.status === 'fulfilled') {
          setCategories(categoriesResult.value);
        } else {
          setCategories([]);
          metadataWarnings.push('Could not load garment categories.');
        }

        if (filtersResult.status === 'fulfilled') {
          setFilterDimensions(
            filtersResult.value.filter(
              (dimension) =>
                (dimension.appliesTo.includes('DESIGN') || dimension.appliesTo.includes('COLLECTION')) &&
                !isLegacyDiscoveryDimensionSlug(dimension.slug),
            ),
          );
        } else {
          setFilterDimensions([]);
          metadataWarnings.push('Could not load style details.');
        }

        if (metadataWarnings.length > 0) {
          setLoadingError(`${metadataWarnings.join(' ')} You can still save a draft, but going live needs metadata.`);
        }

        setCustomOrderConfigurations([]);

        if (!activeDesignId && normalizedAssetHandoffToken) {
          const stagedAssets = consumeDesignEditorAssetBundle(normalizedAssetHandoffToken);
          if (stagedAssets?.length) {
            setAssets(stagedAssets.slice(0, DESIGN_EDITOR_MAX_MEDIA));
            setCoverAssetIdState(stagedAssets[0]?.id ?? null);
            setOriginalMediaIds([]);
          }
        }

        if (activeDesignId) {
          const detail = await getDesignDetail(activeDesignId);
          hydrateFromDetail(detail);
          const activeCustomConfiguration = detail.customOrderEnabled
            ? await getActiveDesignCustomConfiguration(detail.id).catch(() => null)
            : null;
          if (activeCustomConfiguration) {
            setSelectedCustomOrderConfigurationId(activeCustomConfiguration.id);
            setCustomMeasurementKeys(activeCustomConfiguration.resolvedRequiredMeasurementKeys);
            setForm((prev) => ({
              ...prev,
              productionLeadDays: String(activeCustomConfiguration.productionLeadDays),
              buyerInstructionText: activeCustomConfiguration.buyerInstructionText ?? '',
              baseProductionCharge: activeCustomConfiguration.baseProductionCharge,
              fabricCostPerYard: activeCustomConfiguration.fabricCostPerYard,
              deliveryMinDays: String(activeCustomConfiguration.deliveryMinDays),
              deliveryMaxDays: String(activeCustomConfiguration.deliveryMaxDays),
              deliveryScope: activeCustomConfiguration.deliveryScope,
              revisionPolicy: activeCustomConfiguration.revisionPolicy,
              returnPolicy: activeCustomConfiguration.returnPolicy,
              defectPolicy: activeCustomConfiguration.defectPolicy,
              fabricSourcingMode:
                activeCustomConfiguration.fabricSourcingMode === 'BUYER_SUPPLIED' ||
                activeCustomConfiguration.fabricSourcingMode === 'EITHER'
                  ? activeCustomConfiguration.fabricSourcingMode
                  : 'BRAND_SOURCED',
              fallbackOutputYards: activeCustomConfiguration.rules.find((rule) => rule.isFallback)?.outputYards ?? '4',
            }));
            setCustomOrderConfigurations((prev) => {
              if (prev.some((entry) => entry.id === activeCustomConfiguration.id)) return prev;
              return [activeCustomConfiguration, ...prev];
            });
          } else {
            setSelectedCustomOrderConfigurationId('');
          }

          if (detail.status === 'DRAFT') {
            const session = await startDesignDraftSession(activeDesignId, {
              forceNew: forceTakeOver,
              existingToken: draftSessionToken,
              deviceName: 'Threadly mobile',
            });
            if (session.hasConflict) {
              setDraftConflict(session);
            } else {
              setDraftConflict(null);
              setDraftSessionToken(session.sessionToken);
            }
          }

          await loadMeasurementPoints(detail.type);
        } else {
          await loadMeasurementPoints(INITIAL_FORM.audience);
        }

        bootstrappedRef.current = true;
      } catch (error: any) {
        const message =
          typeof error?.response?.data?.message === 'string'
            ? error.response.data.message
            : error instanceof Error
              ? error.message
              : 'Could not load the mobile design studio.';
        setLoadingError(message);
      } finally {
        setBooting(false);
      }
    },
    [activeDesignId, draftSessionToken, hydrateFromDetail, loadMeasurementPoints, normalizedAssetHandoffToken],
  );

  useEffect(() => {
    if (bootstrappedRef.current) return;
    void loadBootstrap(false);
  }, [loadBootstrap]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    void loadMeasurementPoints(form.audience);
  }, [form.audience, loadMeasurementPoints]);

  const selectedCategory = useMemo(
    () => categories.find((entry) => entry.id === form.categoryId) ?? null,
    [categories, form.categoryId],
  );

  const subCategories = selectedCategory?.subCategories ?? [];
  const tags = useMemo(() => parseTags(form.tagsInput), [form.tagsInput]);
  const activeFilterValueIdSet = useMemo(
    () => new Set(filterDimensions.flatMap((dimension) => dimension.values.map((value) => value.id))),
    [filterDimensions],
  );
  const selectedFilterValueIds = useMemo(
    () => getSelectedFilterValueIds(filterSelection).filter((valueId) => activeFilterValueIdSet.has(valueId)),
    [activeFilterValueIdSet, filterSelection],
  );
  const publishValidationMessage = useMemo(
    () =>
      getPublishValidationMessage({
        assetsCount: assets.length,
        form,
        tags,
        filterValueIds: selectedFilterValueIds,
        customMeasurementKeys,
      }),
    [assets.length, customMeasurementKeys, form, selectedFilterValueIds, tags],
  );
  const canSaveDraft =
    assets.length > 0 || hasMeaningfulDraftContent(form, tags, filterSelection);
  const canPublish = publishValidationMessage === null;

  useEffect(() => {
    if (!form.subCategoryId) return;
    if (categories.length === 0) return;
    if (
      selectedCategory?.subCategories.some((entry) => entry.id === form.subCategoryId)
    ) {
      return;
    }
    setForm((prev) => ({ ...prev, subCategoryId: '' }));
  }, [categories.length, form.subCategoryId, selectedCategory]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilterValue = useCallback((dimensionId: string, valueId: string, isMulti: boolean) => {
    setFilterSelection((prev) => {
      const current = prev[dimensionId] ?? [];
      let nextValues: string[];
      if (current.includes(valueId)) {
        nextValues = current.filter((entry) => entry !== valueId);
      } else if (isMulti) {
        nextValues = [...current, valueId];
      } else {
        nextValues = [valueId];
      }

      if (nextValues.length === 0) {
        const next = { ...prev };
        delete next[dimensionId];
        return next;
      }

      return { ...prev, [dimensionId]: nextValues };
    });
  }, []);

  const toggleMeasurementKey = useCallback((key: string) => {
    setCustomMeasurementKeys((prev) =>
      prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key],
    );
  }, []);

  const selectCustomOrderConfiguration = useCallback((configurationId: string) => {
    const selected = customOrderConfigurations.find((entry) => entry.id === configurationId);
    setSelectedCustomOrderConfigurationId(configurationId);
    if (selected) {
      setCustomMeasurementKeys(selected.resolvedRequiredMeasurementKeys);
    }
  }, [customOrderConfigurations]);

  const pickMedia = useCallback(async (source: 'camera' | 'library' = 'library') => {
    const result = await pickDesignEditorMediaAssets({
      source,
      existingCount: assets.length,
      maxMedia: DESIGN_EDITOR_MAX_MEDIA,
    });

    if (result.status === 'cancelled') {
      return false;
    }

    if (result.status === 'limit') {
      toast.error(result.message);
      return false;
    }

    if (result.status === 'permission') {
      setPermissionIssue(result.issue);
      return false;
    }

    setPermissionIssue(null);

    setAssets((prev) => {
      return [...prev, ...result.assets].slice(0, DESIGN_EDITOR_MAX_MEDIA);
    });
    return true;
  }, [assets.length, toast]);

  const clearPermissionIssue = useCallback(() => {
    setPermissionIssue(null);
  }, []);

  const openMediaPermissionSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      toast.error('Could not open settings on this device.');
    }
  }, [toast]);

  const setCoverAssetId = useCallback((assetId: string | null) => {
    setCoverAssetIdState(assetId);
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    setAssets((prev) => {
      const next = prev.filter((asset) => asset.id !== assetId);
      if (coverAssetId === assetId) {
        setCoverAssetIdState(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [coverAssetId]);

  useEffect(() => {
    if (coverAssetId == null && assets.length > 0) {
      setCoverAssetIdState(assets[0].id);
    }
  }, [assets, coverAssetId]);

  const save = useCallback(
    async (action: SaveAction) => {
      if (saveAction) {
        return;
      }
      if (draftConflict?.hasConflict) {
        toast.error('Another device still owns this draft. Take over the draft before saving.');
        return;
      }
      if (!activeDesignId && !hasActiveBrandMembership) {
        toast.error('Sign in with a brand account before creating designs.');
        return;
      }
      if (!activeDesignId && userEmailVerified !== true) {
        toast.error('Verify your email before creating designs.');
        return;
      }
      if (action === 'publish' && publishValidationMessage) {
        toast.error(publishValidationMessage);
        return;
      }
      if (!canSaveDraft) {
        toast.error('Add at least one change before saving.');
        return;
      }

      setSaveAction(action);
      setSaveProgress(0);
      setSaveMessage(action === 'publish' ? 'Preparing to go live...' : 'Preparing draft...');

      try {
        const allowedFilterDimensionIds = new Set(filterDimensions.map((dimension) => dimension.id));
        const filterValueIds = selectedFilterValueIds.filter((valueId) =>
          filterDimensions.some(
            (dimension) =>
              allowedFilterDimensionIds.has(dimension.id) &&
              (filterSelection[dimension.id] ?? []).includes(valueId),
          ),
        );
        const customOrderConfiguration: DesignCustomOrderConfigurationInput | undefined = form.customOrderEnabled
          ? {
              title: form.title.trim() || 'Design custom order',
              buyerInstructionText: form.buyerInstructionText || undefined,
              requiredMeasurementKeys: customMeasurementKeys,
              requiredFreeformPointIds: [],
              baseProductionCharge: form.baseProductionCharge,
              fabricCostPerYard: form.fabricCostPerYard,
              rushEnabled: false,
              productionLeadDays: form.productionLeadDays ? Number(form.productionLeadDays) : 7,
              deliveryMinDays: form.deliveryMinDays ? Number(form.deliveryMinDays) : 2,
              deliveryMaxDays: form.deliveryMaxDays ? Number(form.deliveryMaxDays) : 5,
              deliveryScope: form.deliveryScope.trim() || 'Nigeria',
              revisionPolicy: form.revisionPolicy.trim() || 'One revision after delivery confirmation.',
              returnPolicy: form.returnPolicy.trim() || 'Custom orders are not returnable except where required by policy.',
              defectPolicy: form.defectPolicy.trim() || 'Defects and material faults are reviewed through support.',
              fabricSourcingMode: form.fabricSourcingMode,
              rules: [
                {
                  priority: 1,
                  conditionsJson: {},
                  outputYards: form.fallbackOutputYards,
                  isFallback: true,
                },
              ],
            }
          : undefined;
        const result = await saveDesignEditor(
          {
            title: form.title,
            description: form.description,
            visibility: form.visibility,
            categoryId: form.categoryId || undefined,
            subCategoryId: form.subCategoryId || undefined,
            type: form.audience,
            tags,
            minPrice: form.minPrice ? Number(form.minPrice) : undefined,
            maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
            sizingMode: form.sizingMode,
            customOrderEnabled: form.customOrderEnabled,
            customMeasurementKeys,
            customOrderConfiguration,
            productionLeadDays: form.productionLeadDays ? Number(form.productionLeadDays) : undefined,
            buyerInstructionText: form.buyerInstructionText || undefined,
            fitPreference: form.fitPreference,
            targetAgeGroup: form.targetAgeGroup,
            filterValueIds,
            assets,
            coverMediaId: coverAssetId ?? undefined,
            action,
            designId: activeDesignId ?? undefined,
            originalMediaIds,
            draftSessionToken,
            draftVersion,
          },
          (value, message) => {
            setSaveProgress(value);
            setSaveMessage(message);
          },
        );

        hydrateFromDetail(result.detail);
        setActiveDesignId(result.id);
        setDraftVersion(result.detail.draftVersion);
        toast.success(action === 'publish' ? 'Design is live.' : 'Draft saved.');
        if (action === 'publish') {
          router.replace(routeForDesignTarget(result.id, { legacyCollectionId: result.id }) as any);
          return;
        }
        router.replace({
          pathname: '/catalog',
          params: { tab: 'Collections' },
        } as any);
      } catch (error: any) {
        const message = extractApiErrorMessage(
          error,
          action === 'publish' ? 'Failed to publish design.' : 'Failed to save draft.',
        );
        toast.error(action === 'publish' ? mapCreatorMetadataError(message, 'Failed to publish design.') : message);
      } finally {
        setSaveAction(null);
      }
    },
    [
      activeDesignId,
      assets,
      canSaveDraft,
      customMeasurementKeys,
      draftConflict,
      draftSessionToken,
      draftVersion,
      filterDimensions,
      filterSelection,
      form,
      hydrateFromDetail,
      originalMediaIds,
      publishValidationMessage,
      saveAction,
      selectedCustomOrderConfigurationId,
      selectedFilterValueIds,
      tags,
      toast,
      userEmailVerified,
      hasActiveBrandMembership,
    ],
  );

  const deleteDraft = useCallback(async () => {
    if (!activeDesignId) {
      toast.error('No draft is open.');
      return;
    }
    if (activeDesignStatus !== 'DRAFT') {
      toast.error('Live designs cannot be deleted as drafts.');
      return;
    }

    setSaveAction('draft');
    setSaveProgress(0);
    setSaveMessage('Deleting draft...');
    try {
      await deleteDesign(activeDesignId);
      toast.success('Draft deleted.');
      router.replace({
        pathname: '/catalog',
        params: { tab: 'Collections', visibility: 'Drafts' },
      } as any);
    } catch (error: any) {
      const responseMessage = error?.response?.data?.message;
      toast.error(typeof responseMessage === 'string' ? responseMessage : 'Failed to delete draft.');
    } finally {
      setSaveAction(null);
      setSaveMessage('');
      setSaveProgress(0);
    }
  }, [activeDesignId, activeDesignStatus, toast]);

  const retryBootstrap = useCallback(async () => {
    bootstrappedRef.current = false;
    await loadBootstrap(false);
  }, [loadBootstrap]);

  const takeOverDraftConflict = useCallback(async () => {
    if (!activeDesignId) return;
    await loadBootstrap(true);
  }, [activeDesignId, loadBootstrap]);

  const value = useMemo<ContextValue>(
    () => ({
      booting,
      loadingError,
      draftConflict,
      categories,
      filterDimensions,
      customOrderConfigurations,
      selectedCustomOrderConfigurationId,
      measurementPoints,
      form,
      assets,
      coverAssetId,
      filterSelection,
      customMeasurementKeys,
      originalMediaIds,
      activeDesignId,
      isEditMode: Boolean(activeDesignId),
      isDraft: activeDesignStatus === 'DRAFT',
      saveState: {
        action: saveAction,
        progress: saveProgress,
        message: saveMessage,
      },
      permissionIssue,
      selectedCategory,
      subCategories,
      tags,
      canSaveDraft,
      canPublish,
      updateField,
      setFilterSelection,
      toggleFilterValue,
      toggleMeasurementKey,
      selectCustomOrderConfiguration,
      pickMedia,
      clearPermissionIssue,
      openMediaPermissionSettings,
      removeAsset,
      setCoverAssetId,
      save,
      deleteDraft,
      retryBootstrap,
      takeOverDraftConflict,
    }),
    [
      activeDesignId,
      activeDesignStatus,
      assets,
      coverAssetId,
      booting,
      canPublish,
      canSaveDraft,
      categories,
      clearPermissionIssue,
      customOrderConfigurations,
      customMeasurementKeys,
      draftConflict,
      filterDimensions,
      filterSelection,
      form,
      loadingError,
      measurementPoints,
      originalMediaIds,
      openMediaPermissionSettings,
      permissionIssue,
      pickMedia,
      removeAsset,
      setCoverAssetId,
      retryBootstrap,
      save,
      deleteDraft,
      saveAction,
      saveMessage,
      saveProgress,
      selectedCategory,
      selectedCustomOrderConfigurationId,
      selectCustomOrderConfiguration,
      subCategories,
      tags,
      takeOverDraftConflict,
      toggleFilterValue,
      toggleMeasurementKey,
      updateField,
    ],
  );

  return <DesignEditorContext.Provider value={value}>{children}</DesignEditorContext.Provider>;
}

export function useDesignEditor() {
  const context = useContext(DesignEditorContext);
  if (!context) {
    throw new Error('useDesignEditor must be used inside DesignEditorProvider');
  }
  return context;
}
