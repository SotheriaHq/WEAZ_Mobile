import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { router } from 'expo-router';

import {
  getDesignCategories,
  getDesignDetail,
  getDesignFilterDimensions,
  getActiveDesignCustomConfiguration,
  getVisibleCustomOrderConfigurations,
  getMeasurementPoints,
  saveDesignEditor,
  startDesignDraftSession,
  type DesignCustomOrderConfiguration,
  type DesignCategoryOption,
  type DesignDetail,
  type DesignEditorAsset,
  type DesignFilterSelection,
  type DraftSessionResponse,
  type FilterDimensionOption,
  type MeasurementPointOption,
} from '@/src/api/DesignApi';
import { brandApi } from '@/src/api/BrandApi';
import { useToast } from '@/src/toast/ToastContext';

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
  fitPreference: FitPreference;
  targetAgeGroup: TargetAgeGroup;
};

type SaveAction = 'draft' | 'publish';
type MediaPermissionIssue = {
  source: 'camera' | 'library';
  title: string;
  message: string;
  canAskAgain: boolean;
};

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
  moveAsset: (assetId: string, direction: 'left' | 'right') => void;
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
  fitPreference: 'REGULAR',
  targetAgeGroup: 'ADULT',
};

const MAX_MEDIA = 20;

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

export function DesignEditorProvider({
  designId,
  children,
}: {
  designId?: string;
  children: React.ReactNode;
}) {
  const toast = useToast();
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
        const [nextCategories, nextFilters, nextCustomOrderConfigurations] = await Promise.all([
          getDesignCategories(),
          getDesignFilterDimensions(),
          getVisibleCustomOrderConfigurations().catch(() => []),
        ]);
        setCategories(nextCategories);
        setFilterDimensions(
          nextFilters.filter((dimension) => dimension.appliesTo.includes('COLLECTION')),
        );
        setCustomOrderConfigurations(nextCustomOrderConfigurations);

        if (activeDesignId) {
          const detail = await getDesignDetail(activeDesignId);
          hydrateFromDetail(detail);
          const activeCustomConfiguration = detail.customOrderEnabled
            ? await getActiveDesignCustomConfiguration(detail.id).catch(() => null)
            : null;
          if (activeCustomConfiguration) {
            setSelectedCustomOrderConfigurationId(activeCustomConfiguration.id);
            setCustomMeasurementKeys(activeCustomConfiguration.resolvedRequiredMeasurementKeys);
            setCustomOrderConfigurations((prev) => {
              if (prev.some((entry) => entry.id === activeCustomConfiguration.id)) return prev;
              return [activeCustomConfiguration, ...prev];
            });
          } else {
            setSelectedCustomOrderConfigurationId('');
            if (detail.customOrderEnabled && nextCustomOrderConfigurations.length === 0) {
              setForm((prev) => ({ ...prev, customOrderEnabled: false }));
            }
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
    [activeDesignId, draftSessionToken, hydrateFromDetail, loadMeasurementPoints],
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
  const canSaveDraft =
    assets.length > 0 ||
    form.title.trim().length > 0 ||
    form.description.trim().length > 0 ||
    tags.length > 0;
  const canPublish =
    assets.length > 0 &&
    form.title.trim().length > 0 &&
    Boolean(form.categoryId) &&
    Boolean(form.subCategoryId) &&
    tags.length > 0 &&
    (!form.customOrderEnabled || (Boolean(selectedCustomOrderConfigurationId) && customMeasurementKeys.length > 0));

  useEffect(() => {
    if (!selectedCategory) return;
    if (selectedCategory.subCategories.some((entry) => entry.id === form.subCategoryId)) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      subCategoryId: selectedCategory.subCategories[0]?.id ?? '',
    }));
  }, [form.subCategoryId, selectedCategory]);

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
    const remainingSlots = Math.max(0, MAX_MEDIA - assets.length);
    if (remainingSlots === 0) {
      toast.error(`You can upload up to ${MAX_MEDIA} design assets.`);
      return false;
    }

    setPermissionIssue(null);

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPermissionIssue({
          source,
          title: 'Camera permission needed',
          message: permission.canAskAgain
            ? 'Allow camera access to capture a photo or video for this design.'
            : 'Camera access is blocked. Open settings to allow Threadly to use your camera.',
          canAskAgain: Boolean(permission.canAskAgain),
        });
        return false;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPermissionIssue({
          source,
          title: 'Photo library permission needed',
          message: permission.canAskAgain
            ? 'Allow photo library access to select design media from your device.'
            : 'Photo library access is blocked. Open settings to allow Threadly to use your media.',
          canAskAgain: Boolean(permission.canAskAgain),
        });
        return false;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
            quality: 0.9,
            selectionLimit: remainingSlots,
          });

    if (result.canceled || !result.assets?.length) {
      return false;
    }

    setAssets((prev) => {
      const mapped = result.assets.map((asset, index) => ({
        id: `${asset.assetId ?? asset.uri}_${Date.now()}_${index}`,
        uri: asset.uri,
        mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileName:
          asset.fileName ??
          `design-${prev.length + index + 1}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
        fileSize: asset.fileSize ?? 0,
        mediaKind: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        aspectRatio:
          typeof asset.width === 'number' && typeof asset.height === 'number' && asset.height > 0
            ? asset.width / asset.height
            : null,
      }));
      return [...prev, ...mapped].slice(0, MAX_MEDIA);
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

  const moveAsset = useCallback((assetId: string, direction: 'left' | 'right') => {
    setAssets((prev) => {
      const index = prev.findIndex((asset) => asset.id === assetId);
      if (index < 0) return prev;
      const nextIndex = direction === 'left' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }, []);

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
      if (draftConflict?.hasConflict) {
        toast.error('Another device still owns this draft. Take over the draft before saving.');
        return;
      }
      if (action === 'publish' && !canPublish) {
        toast.error('Add media, title, category, and tags before publishing.');
        return;
      }
      if (!canSaveDraft) {
        toast.error('Add at least one change before saving.');
        return;
      }

      setSaveAction(action);
      setSaveProgress(0);
      setSaveMessage(action === 'publish' ? 'Preparing design...' : 'Preparing draft...');

      try {
        const filterValueIds = Array.from(new Set(Object.values(filterSelection).flat()));
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
            customOrderConfigurationTemplateId: selectedCustomOrderConfigurationId || undefined,
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
        toast.success(action === 'publish' ? 'Design published.' : 'Draft saved.');
        if (action === 'publish') {
          router.replace({
            pathname: '/catalog/view/[collectionId]',
            params: {
              collectionId: result.id,
              scope: 'design',
            },
          } as any);
          return;
        }
        router.replace({
          pathname: '/catalog',
          params: { tab: 'Collections' },
        } as any);
      } catch (error: any) {
        const responseMessage = error?.response?.data?.message;
        const message =
          Array.isArray(responseMessage)
            ? responseMessage.join(', ')
            : typeof responseMessage === 'string'
              ? responseMessage
              : error instanceof Error
                ? error.message
                : action === 'publish'
                  ? 'Failed to publish design.'
                  : 'Failed to save draft.';
        toast.error(message);
      } finally {
        setSaveAction(null);
      }
    },
    [
      activeDesignId,
      assets,
      canPublish,
      canSaveDraft,
      customMeasurementKeys,
      draftConflict,
      draftSessionToken,
      draftVersion,
      filterSelection,
      form,
      hydrateFromDetail,
      originalMediaIds,
      selectedCustomOrderConfigurationId,
      tags,
      toast,
    ],
  );

  const deleteDraft = useCallback(async () => {
    if (!activeDesignId) {
      toast.error('No draft is open.');
      return;
    }
    if (activeDesignStatus !== 'DRAFT') {
      toast.error('Published designs cannot be deleted as drafts.');
      return;
    }

    setSaveAction('draft');
    setSaveProgress(0);
    setSaveMessage('Deleting draft...');
    try {
      await brandApi.deleteCollection(activeDesignId);
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
      moveAsset,
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
      moveAsset,
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
