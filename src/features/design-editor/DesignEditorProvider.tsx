import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, LayoutAnimation } from 'react-native';
import { router } from 'expo-router';

import {
  getDesignDetail,
  getActiveDesignCustomConfiguration,
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
import { useAuth, useAuthSession } from '@/src/auth/AuthContext';
import {
  fetchDesignCategoriesQuery,
  fetchDesignFilterDimensionsQuery,
  fetchMeasurementPointsQuery,
} from '@/src/query/bootstrapQueries';
import { queryClient } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { useToast } from '@/src/toast/ToastContext';
import {
  getSelectedFilterValueIds,
  isLegacyDiscoveryDimensionSlug,
  mapCreatorMetadataError,
} from '@/src/utils/creatorMetadata';
import {
  consumeDesignEditorAssetBundle,
  DESIGN_EDITOR_MAX_MEDIA,
  pickDesignEditorMediaAssets,
  type MediaPermissionIssue,
} from './designEditorMediaFlow';
import {
  DESIGN_REQUIRED_MEDIA_COUNT,
  MEDIA_VIEW_SLOT_OPTIONS,
  getMediaViewSlotLabel,
  getMissingRequiredImageMediaSlots,
  getMissingRequiredMediaSlots,
  normalizeDesignCreationSizingMode,
  normalizeMediaViewSlot,
  type ContentPublicationStatus,
} from './designCreationRules';
import {
  createDesignEditorBackgroundTask,
  readDesignEditorRecoverySnapshot,
  removeDesignEditorBackgroundTask,
  updateDesignEditorBackgroundTask,
  type DesignEditorRecoverySnapshot,
} from './designEditorBackgroundTasks';

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
  averageBaseYards: string;
  fitPreference: FitPreference;
  targetAgeGroup: TargetAgeGroup;
  rushEnabled: boolean;
  rushFee: string;
  rushProductionLeadDays: string;
  notes: string;
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
  sizingMode: 'NONE',
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
  averageBaseYards: '',
  fitPreference: 'REGULAR',
  targetAgeGroup: 'ADULT',
  rushEnabled: false,
  rushFee: '',
  rushProductionLeadDays: '',
  notes: '',
};

function restoreRecoveryForm(value: Record<string, unknown>): FormState {
  const restored = { ...INITIAL_FORM };
  (Object.keys(INITIAL_FORM) as Array<keyof FormState>).forEach((key) => {
    const candidate = value[key];
    if (typeof candidate === typeof INITIAL_FORM[key]) {
      (restored as Record<keyof FormState, unknown>)[key] = candidate;
    }
  });
  return restored;
}

const DesignEditorContext = createContext<ContextValue | null>(null);
const DEFAULT_PRODUCTION_LEAD_DAYS = 7;
const MAX_PRODUCTION_LEAD_DAYS = 7;
const MAX_RUSH_LEAD_DAYS = 3;

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
    sizingMode: normalizeDesignCreationSizingMode(detail.sizingMode),
    customOrderEnabled: detail.customOrderEnabled || normalizeDesignCreationSizingMode(detail.sizingMode) === 'CUSTOM',
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
    averageBaseYards: '',
    fitPreference: detail.fitPreference ?? 'REGULAR',
    targetAgeGroup: detail.targetAgeGroup ?? 'ADULT',
    rushEnabled: false,
    rushFee: '',
    rushProductionLeadDays: '',
    notes: '',
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
    viewSlot:
      normalizeMediaViewSlot(media.viewSlot) ??
      MEDIA_VIEW_SLOT_OPTIONS[index]?.value ??
      MEDIA_VIEW_SLOT_OPTIONS[MEDIA_VIEW_SLOT_OPTIONS.length - 1].value,
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
  if (form.sizingMode !== 'NONE') return true;
  if (form.customOrderEnabled) return true;
  if (form.productionLeadDays.trim().length > 0) return true;
  if (form.buyerInstructionText.trim().length > 0) return true;
  if (form.baseProductionCharge.trim().length > 0) return true;
  if (form.fabricCostPerYard.trim().length > 0) return true;
  if (form.fitPreference !== 'REGULAR') return true;
  if (form.targetAgeGroup !== 'ADULT') return true;
  return Object.values(filterSelection).some((values) => values.length > 0);
}

function getCustomOrderProductionValidationMessage(form: FormState): string | null {
  if (!form.customOrderEnabled) return null;

  const productionLeadDays = form.productionLeadDays.trim()
    ? Number(form.productionLeadDays)
    : DEFAULT_PRODUCTION_LEAD_DAYS;

  if (
    !Number.isInteger(productionLeadDays) ||
    productionLeadDays < 1 ||
    productionLeadDays > MAX_PRODUCTION_LEAD_DAYS
  ) {
    return 'Set standard production time between 1 and 7 days.';
  }

  return null;
}

// Mirrors the backend custom-order rush rules so the creator gets clear inline
// guidance instead of a raw 400 from POST /custom-order-configurations. Returns
// null when custom orders or rush are disabled (rush fields are then ignored).
function getCustomOrderRushValidationMessage(form: FormState): string | null {
  if (!form.customOrderEnabled || !form.rushEnabled) return null;

  const rushFee = Number(form.rushFee);
  if (!form.rushFee.trim() || !Number.isFinite(rushFee) || rushFee <= 0) {
    return 'Add a rush fee greater than 0, or turn off rush orders.';
  }

  const rushLeadDays = Number(form.rushProductionLeadDays);
  if (
    !form.rushProductionLeadDays.trim() ||
    !Number.isInteger(rushLeadDays) ||
    rushLeadDays < 1 ||
    rushLeadDays > MAX_RUSH_LEAD_DAYS
  ) {
    return 'Set rush production lead time between 1 and 3 days (72 hours max).';
  }

  const standardLeadDays = form.productionLeadDays.trim()
    ? Number(form.productionLeadDays)
    : DEFAULT_PRODUCTION_LEAD_DAYS;
  if (rushLeadDays >= standardLeadDays) {
    return 'Rush production lead time must be shorter than the standard production lead time.';
  }

  return null;
}

// Phase 2B: delivery/production range is locked to 1-7 days (web/native/backend
// must agree). Mirrors the backend custom-order-configurations guardrails.
function getCustomOrderDeliveryValidationMessage(form: FormState): string | null {
  if (!form.customOrderEnabled) return null;

  const min = Number(form.deliveryMinDays);
  const max = Number(form.deliveryMaxDays);
  const isValidDay = (value: number) =>
    Number.isInteger(value) && value >= 1 && value <= 7;

  if (!form.deliveryMinDays.trim() || !isValidDay(min)) {
    return 'Set the minimum delivery time between 1 and 7 days.';
  }
  if (!form.deliveryMaxDays.trim() || !isValidDay(max)) {
    return 'Set the maximum delivery time between 1 and 7 days.';
  }
  if (min > max) {
    return 'Minimum delivery days cannot exceed maximum delivery days.';
  }
  return null;
}

// Phase 2B: enforce minPrice <= maxPrice before Preview so the creator never
// hits a backend PRICE_RANGE_INVALID at submit time.
function getPriceRangeValidationMessage(form: FormState): string | null {
  if (!form.minPrice.trim() || !form.maxPrice.trim()) return null;
  const min = Number(form.minPrice);
  const max = Number(form.maxPrice);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) {
    return 'Maximum price must be greater than or equal to minimum price.';
  }
  return null;
}

function getPublishValidationMessage({
  assets,
  form,
  tags,
  filterValueIds,
  customMeasurementKeys,
}: {
  assets: DesignEditorAsset[];
  form: FormState;
  tags: string[];
  filterValueIds: string[];
  customMeasurementKeys: string[];
}) {
  const missingRequiredSlots = getMissingRequiredMediaSlots(assets);
  const missingRequiredImageSlots = getMissingRequiredImageMediaSlots(assets);
  if (assets.length === 0) return 'Add Front, Back, Left Side, and Right Side media before previewing.';
  if (missingRequiredSlots.length > 0) {
    return `Add ${missingRequiredSlots.map(getMediaViewSlotLabel).join(', ')} media before previewing.`;
  }
  if (missingRequiredImageSlots.length > 0) {
    return `${missingRequiredImageSlots.map(getMediaViewSlotLabel).join(', ')} must be image uploads before previewing. Replace videos or unsupported files in those views.`;
  }
  if (assets.length < DESIGN_REQUIRED_MEDIA_COUNT) return 'Add Front, Back, Left Side, and Right Side media before previewing.';
  if (assets.length > DESIGN_EDITOR_MAX_MEDIA) return 'Remove extra media before previewing.';
  if (form.title.trim().length === 0) return 'Add a title before previewing.';
  if (!form.categoryId) return 'Choose what this item is.';
  if (!form.subCategoryId) return 'Choose a garment type.';
  if (!form.audience) return 'Choose who this item is for.';
  if (!form.targetAgeGroup) return 'Choose an age group.';
  if (filterValueIds.length === 0) return 'Add at least one style detail.';
  if (tags.length === 0) return 'Add at least one hashtag.';
  const priceRangeMessage = getPriceRangeValidationMessage(form);
  if (priceRangeMessage) return priceRangeMessage;
  if (form.customOrderEnabled && customMeasurementKeys.length === 0) return 'Choose required custom-order fields.';
  if (
    form.customOrderEnabled &&
    (!form.baseProductionCharge.trim() || !form.fabricCostPerYard.trim() || !form.fallbackOutputYards.trim())
  ) {
    return 'Add custom-order pricing before previewing.';
  }
  const productionMessage = getCustomOrderProductionValidationMessage(form);
  if (productionMessage) return productionMessage;
  const deliveryMessage = getCustomOrderDeliveryValidationMessage(form);
  if (deliveryMessage) return deliveryMessage;
  const rushMessage = getCustomOrderRushValidationMessage(form);
  if (rushMessage) return rushMessage;
  return null;
}

// Generic technical/transport noise that must never reach the user. Field-level
// validation text (e.g. "categoryId should not be empty") is intentionally NOT
// listed here so mapCreatorMetadataError can still turn it into friendly guidance.
const TECHNICAL_ERROR_NOISE = [
  'network',
  'formdata',
  'timeout',
  'unsupported',
  'json',
  'axios',
  'request failed',
  'status code',
  'validation failed',
  'internal server error',
  'native module',
  'undefined is not',
  'is not a function',
  'cannot read',
  'null is not',
  'socket',
  'econn',
];

function isTechnicalErrorNoise(message: string) {
  const normalized = message.toLowerCase();
  return TECHNICAL_ERROR_NOISE.some((keyword) => normalized.includes(keyword));
}

function extractApiErrorMessage(error: any, fallback: string) {
  const responseData = error?.response?.data;
  const responseMessage = responseData?.message;

  let candidate: string | null = null;
  if (Array.isArray(responseMessage)) {
    candidate = responseMessage.join(', ');
  } else if (typeof responseMessage === 'string') {
    candidate = responseMessage;
  } else if (
    responseMessage &&
    typeof responseMessage === 'object' &&
    typeof responseMessage.message === 'string'
  ) {
    candidate = responseMessage.message;
  } else if (typeof responseData?.error === 'string') {
    candidate = responseData.error;
  } else if (error instanceof Error && error.message) {
    candidate = error.message;
  }

  // Any transport/runtime noise (Axios, FormData, native module, undefined-is-not-
  // a-function, generic "Validation failed", etc.) is replaced by the safe fallback.
  if (!candidate || isTechnicalErrorNoise(candidate)) {
    return fallback;
  }
  return candidate;
}

export function DesignEditorProvider({
  designId,
  assetHandoffToken,
  recoveryTaskId,
  children,
}: {
  designId?: string;
  assetHandoffToken?: string;
  recoveryTaskId?: string;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const { hasActiveBrandMembership, userEmailVerified } = useAuthSession();
  const [booting, setBooting] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [draftConflict, setDraftConflict] = useState<DraftSessionResponse | null>(null);
  // Seed metadata from the React Query cache so reopening the creator paints the
  // option lists instantly while the cached fetchers revalidate in the background.
  const [categories, setCategories] = useState<DesignCategoryOption[]>(
    () => queryClient.getQueryData<DesignCategoryOption[]>(queryKeys.categories.designCategories()) ?? [],
  );
  const [filterDimensions, setFilterDimensions] = useState<FilterDimensionOption[]>([]);
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPointOption[]>([]);
  const [customOrderConfigurations, setCustomOrderConfigurations] = useState<DesignCustomOrderConfiguration[]>([]);
  const [selectedCustomOrderConfigurationId, setSelectedCustomOrderConfigurationId] = useState('');
  const [loadedRules, setLoadedRules] = useState<DesignCustomOrderConfiguration['rules'] | null>(null);
  const [loadedSizeExtraYards, setLoadedSizeExtraYards] = useState<any[] | null>(null);
  const [loadedFabricRuleBasisId, setLoadedFabricRuleBasisId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  // Eagerly consume staged assets so they are instantly visible during the route transition,
  // instead of waiting for categories/metadata to load.
  const initialStagedAssets = useMemo(() => {
    const token = assetHandoffToken?.trim();
    if (!designId && token) {
      return consumeDesignEditorAssetBundle(token);
    }
    return null;
  }, [assetHandoffToken, designId]);

  const [assets, setAssets] = useState<DesignEditorAsset[]>(() => {
    if (initialStagedAssets?.length) {
      return initialStagedAssets.slice(0, DESIGN_EDITOR_MAX_MEDIA);
    }
    return [];
  });

  const [coverAssetId, setCoverAssetIdState] = useState<string | null>(() => {
    if (initialStagedAssets?.length) {
      return initialStagedAssets[0]?.id ?? null;
    }
    return null;
  });
  const [filterSelection, setFilterSelection] = useState<DesignFilterSelection>({});
  const [customMeasurementKeys, setCustomMeasurementKeys] = useState<string[]>([]);
  const [originalMediaIds, setOriginalMediaIds] = useState<string[]>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(designId ?? null);
  const [activeDesignStatus, setActiveDesignStatus] = useState<ContentPublicationStatus>('DRAFT');
  const [draftSessionToken, setDraftSessionToken] = useState<string | undefined>(undefined);
  const [draftVersion, setDraftVersion] = useState<number | undefined>(undefined);
  const [saveAction, setSaveAction] = useState<SaveAction | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState('');
  const [permissionIssue, setPermissionIssue] = useState<MediaPermissionIssue | null>(null);

  const bootstrappedRef = useRef(false);
  const mountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const lastAutoBaseChargeRef = useRef('');
  // Tracks the last measurement-point gender we requested so the bootstrap call
  // and the audience-change effect never fire a duplicate request for the same
  // gender during creator bootstrapping.
  const lastMeasurementGenderRef = useRef<string | null>(null);
  const normalizedAssetHandoffToken = assetHandoffToken?.trim() || undefined;
  const normalizedRecoveryTaskId = recoveryTaskId?.trim() || undefined;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const hydrateFromRecoverySnapshot = useCallback((snapshot: DesignEditorRecoverySnapshot) => {
    const recoveredForm = restoreRecoveryForm(snapshot.form);
    const recoveredAssets = Array.isArray(snapshot.assets)
      ? snapshot.assets.slice(0, DESIGN_EDITOR_MAX_MEDIA)
      : [];
    const recoveredAssetIds = new Set(recoveredAssets.map((asset) => asset.id));

    setForm(recoveredForm);
    setFilterSelection(snapshot.filterSelection ?? {});
    setCustomMeasurementKeys(
      Array.isArray(snapshot.customMeasurementKeys) ? snapshot.customMeasurementKeys : [],
    );
    setAssets(recoveredAssets);
    setCoverAssetIdState(
      snapshot.coverAssetId && recoveredAssetIds.has(snapshot.coverAssetId)
        ? snapshot.coverAssetId
        : recoveredAssets[0]?.id ?? null,
    );
    setOriginalMediaIds(
      Array.isArray(snapshot.originalMediaIds) ? snapshot.originalMediaIds : [],
    );
    setSelectedCustomOrderConfigurationId(snapshot.selectedCustomOrderConfigurationId ?? '');
    setDraftSessionToken(snapshot.draftSessionToken);
    setDraftVersion(snapshot.draftVersion);
    return recoveredForm;
  }, []);

  const loadMeasurementPoints = useCallback(async (audience: Audience) => {
    const gender = measurementGenderForAudience(audience);
    const genderKey = gender ?? 'all';
    // Skip duplicate requests for the same resolved gender (e.g. the audience
    // effect firing right after bootstrap already loaded the same gender).
    if (lastMeasurementGenderRef.current === genderKey) {
      return;
    }
    lastMeasurementGenderRef.current = genderKey;

    // Paint cached measurement points immediately if present.
    const cached = queryClient.getQueryData<MeasurementPointOption[]>(
      queryKeys.measurementPoints.byGender(gender ?? null),
    );
    if (cached) {
      setMeasurementPoints(cached);
    }

    try {
      const points = await fetchMeasurementPointsQuery(gender);
      setMeasurementPoints(points);
    } catch {
      lastMeasurementGenderRef.current = null;
      if (!cached) {
        setMeasurementPoints([]);
      }
    }
  }, []);

  const loadBootstrap = useCallback(
    async (forceTakeOver = false) => {
      setBooting(true);
      setLoadingError(null);
      try {
        const [categoriesResult, filtersResult] = await Promise.allSettled([
          fetchDesignCategoriesQuery(),
          fetchDesignFilterDimensionsQuery(),
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

        // Staged assets are now consumed eagerly during state initialization (see initialStagedAssets above).

        let recoveredForm: FormState | null = null;
        if (!activeDesignId && normalizedRecoveryTaskId && user?.id) {
          const snapshot = await readDesignEditorRecoverySnapshot(
            normalizedRecoveryTaskId,
            user.id,
          );
          if (snapshot) {
            recoveredForm = hydrateFromRecoverySnapshot(snapshot);
          } else {
            toast.error('This failed upload no longer has recoverable local data. Start a new design instead.');
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
              averageBaseYards: activeCustomConfiguration.yardProfile?.averageBaseYards != null
                ? String(activeCustomConfiguration.yardProfile.averageBaseYards)
                : '',
            }));
            setLoadedRules(activeCustomConfiguration.rules);
            setLoadedSizeExtraYards(activeCustomConfiguration.yardProfile?.sizeExtraYards ?? null);
            setLoadedFabricRuleBasisId(activeCustomConfiguration.fabricRuleBasisId ?? null);
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
              deviceName: 'WIEZ mobile',
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
          await loadMeasurementPoints(recoveredForm?.audience ?? INITIAL_FORM.audience);
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
    [
      activeDesignId,
      draftSessionToken,
      hydrateFromDetail,
      hydrateFromRecoverySnapshot,
      loadMeasurementPoints,
      normalizedAssetHandoffToken,
      normalizedRecoveryTaskId,
      toast,
      user?.id,
    ],
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
        assets,
        form,
        tags,
        filterValueIds: selectedFilterValueIds,
        customMeasurementKeys,
      }),
    [assets, customMeasurementKeys, form, selectedFilterValueIds, tags],
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
    setForm((prev) => {
      const next: FormState = { ...prev, [key]: value };

      if (key === 'minPrice') {
        const nextDefaultBaseCharge = String(value ?? '').trim();
        const previousDefaultBaseCharge = lastAutoBaseChargeRef.current;
        const shouldSyncBaseCharge =
          prev.customOrderEnabled &&
          nextDefaultBaseCharge.length > 0 &&
          (prev.baseProductionCharge.trim().length === 0 ||
            prev.baseProductionCharge.trim() === previousDefaultBaseCharge);

        if (shouldSyncBaseCharge) {
          next.baseProductionCharge = nextDefaultBaseCharge;
          lastAutoBaseChargeRef.current = nextDefaultBaseCharge;
        } else if (
          // Parity with web: clearing min price clears the base charge only when
          // it was auto-populated (still equal to the last auto value) and the
          // user never manually overrode it.
          nextDefaultBaseCharge.length === 0 &&
          previousDefaultBaseCharge.length > 0 &&
          prev.customOrderEnabled &&
          prev.baseProductionCharge.trim() === previousDefaultBaseCharge
        ) {
          next.baseProductionCharge = '';
          lastAutoBaseChargeRef.current = '';
        } else if (nextDefaultBaseCharge.length > 0 && previousDefaultBaseCharge.length === 0) {
          lastAutoBaseChargeRef.current = nextDefaultBaseCharge;
        }
      }

      if (key === 'customOrderEnabled' && Boolean(value) && !prev.baseProductionCharge.trim() && prev.minPrice.trim()) {
        next.baseProductionCharge = prev.minPrice.trim();
        lastAutoBaseChargeRef.current = prev.minPrice.trim();
      }

      return next;
    });
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

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
      if (saveAction || isSavingRef.current) {
        return;
      }
      if (draftConflict?.hasConflict) {
        toast.error('Another device still owns this draft. Take over the draft before saving.');
        return;
      }
      if (!user?.id) {
        toast.error('Sign in with a brand account before saving designs.');
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
      // Rush config is sent for both draft and publish when custom orders are on,
      // so guard both paths against the backend rush rules (publish is also gated
      // earlier via publishValidationMessage, this catches draft saves too).
      const productionValidationMessage = getCustomOrderProductionValidationMessage(form);
      if (productionValidationMessage) {
        toast.error(productionValidationMessage);
        return;
      }
      const rushValidationMessage = getCustomOrderRushValidationMessage(form);
      if (rushValidationMessage) {
        toast.error(rushValidationMessage);
        return;
      }
      // Delivery + price-range are sent on both draft and publish, so guard both
      // paths against the backend DELIVERY_RANGE_INVALID / PRICE_RANGE_INVALID
      // contracts (publish is also gated earlier via publishValidationMessage).
      const deliveryValidationMessage = getCustomOrderDeliveryValidationMessage(form);
      if (deliveryValidationMessage) {
        toast.error(deliveryValidationMessage);
        return;
      }
      const priceRangeValidationMessage = getPriceRangeValidationMessage(form);
      if (priceRangeValidationMessage) {
        toast.error(priceRangeValidationMessage);
        return;
      }

      setSaveAction(action);
      setSaveProgress(0);
      setSaveMessage(action === 'publish' ? 'Preparing to go live...' : 'Preparing draft...');
      isSavingRef.current = true;

      try {
        const allowedFilterDimensionIds = new Set(filterDimensions.map((dimension) => dimension.id));
        const filterValueIds = selectedFilterValueIds.filter((valueId) =>
          filterDimensions.some(
            (dimension) =>
              allowedFilterDimensionIds.has(dimension.id) &&
              (filterSelection[dimension.id] ?? []).includes(valueId),
          ),
        );
        let rulesPayload: DesignCustomOrderConfigurationInput['rules'] = [
          {
            priority: 1,
            conditionsJson: {},
            outputYards: form.fallbackOutputYards,
            isFallback: true,
          },
        ];
        if (loadedRules && loadedRules.length > 0) {
          rulesPayload = loadedRules.map((rule) => {
            if (rule.isFallback) {
              return {
                ...rule,
                outputYards: form.fallbackOutputYards,
              };
            }
            return rule;
          });
        }

        const customOrderConfiguration: DesignCustomOrderConfigurationInput | undefined = form.customOrderEnabled
          ? {
              title: form.title.trim() || 'Design custom order',
              buyerInstructionText: form.buyerInstructionText || undefined,
              requiredMeasurementKeys: customMeasurementKeys,
              requiredFreeformPointIds: [],
              baseProductionCharge: form.baseProductionCharge,
              fabricCostPerYard: form.fabricCostPerYard,
              rushEnabled: form.rushEnabled,
              rushFee: form.rushFee || undefined,
              rushProductionLeadDays: form.rushProductionLeadDays ? Number(form.rushProductionLeadDays) : undefined,
              notes: form.notes || undefined,
              productionLeadDays: form.productionLeadDays ? Number(form.productionLeadDays) : DEFAULT_PRODUCTION_LEAD_DAYS,
              deliveryMinDays: form.deliveryMinDays ? Number(form.deliveryMinDays) : 2,
              deliveryMaxDays: form.deliveryMaxDays ? Number(form.deliveryMaxDays) : 5,
              deliveryScope: form.deliveryScope.trim() || 'Nigeria',
              revisionPolicy: form.revisionPolicy.trim() || 'One revision after delivery confirmation.',
              returnPolicy: form.returnPolicy.trim() || 'Custom orders are not returnable except where required by policy.',
              defectPolicy: form.defectPolicy.trim() || 'Defects and material faults are reviewed through support.',
              fabricSourcingMode: form.fabricSourcingMode,
              averageBaseYards: form.averageBaseYards.trim() ? Number(form.averageBaseYards) : undefined,
              sizeExtraYards: loadedSizeExtraYards || undefined,
              fabricRuleBasisId: loadedFabricRuleBasisId || undefined,
              rules: rulesPayload,
            }
          : undefined;
        const payload = {
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
        };
        const titleForTask = form.title.trim() || (action === 'draft' ? 'Untitled draft' : 'Untitled design');
        const coverPreviewUri =
          assets.find((asset) => asset.id === coverAssetId)?.uri ??
          assets[0]?.uri ??
          null;
        const task = createDesignEditorBackgroundTask({
          ownerUserId: user.id,
          action,
          title: titleForTask,
          visibility: form.visibility,
          previewUri: coverPreviewUri,
          designId: activeDesignId,
          message: action === 'publish' ? 'Going live...' : 'Saving draft...',
          recoverySnapshot: {
            ownerUserId: user.id,
            form: { ...form },
            assets: assets.map((asset) => ({ ...asset })),
            coverAssetId,
            filterSelection: Object.fromEntries(
              Object.entries(filterSelection).map(([key, value]) => [key, [...value]]),
            ),
            customMeasurementKeys: [...customMeasurementKeys],
            originalMediaIds: [...originalMediaIds],
            selectedCustomOrderConfigurationId,
            draftSessionToken,
            draftVersion,
            capturedAt: Date.now(),
          },
        });
        if (normalizedRecoveryTaskId && normalizedRecoveryTaskId !== task.id) {
          removeDesignEditorBackgroundTask(normalizedRecoveryTaskId);
        }
        router.replace({
          pathname: '/catalog',
          params: {
            tab: 'Collections',
            visibility: action === 'publish' ? 'In Review' : 'Drafts',
          },
        } as any);
        const resolvePublishVisibility = (status?: string | null) => {
          // After Go Live, route by the design's resolved publication status so
          // the owner lands on the tab that actually contains the item. Newly
          // submitted designs are typically IN_REVIEW (not Public).
          switch (String(status ?? '').toUpperCase()) {
            case 'IN_REVIEW':
              return 'In Review';
            case 'CHANGES_REQUESTED':
              return 'Changes Requested';
            case 'REJECTED':
              return 'Rejected';
            case 'PUBLISHED':
              return form.visibility === 'PRIVATE' ? 'Private' : 'Public';
            default:
              return form.visibility === 'PRIVATE' ? 'Private' : 'Public';
          }
        };

        try {
          const result = await saveDesignEditor(
            payload,
            (value, message) => {
              updateDesignEditorBackgroundTask(task.id, {
                progress: value,
                message,
              });
              if (mountedRef.current) {
                setSaveProgress(value);
                setSaveMessage(message);
              }
            },
            (id) => {
              updateDesignEditorBackgroundTask(task.id, { designId: id });
              if (mountedRef.current) {
                setActiveDesignId(id);
              }
            },
          );

          const targetVisibility =
            action === 'draft' ? 'Drafts' : resolvePublishVisibility(result.detail.status);
          const publishCompleteMessage =
            targetVisibility === 'Public' || targetVisibility === 'Private'
              ? 'Design is live.'
              : 'Submitted for review.';

          updateDesignEditorBackgroundTask(task.id, {
            status: 'complete',
            progress: 1,
            designId: result.id,
            message: action === 'publish' ? publishCompleteMessage : 'Draft saved.',
            recoverySnapshot: null,
          });
          toast.success(action === 'publish' ? publishCompleteMessage : 'Draft saved.');

          if (mountedRef.current) {
            hydrateFromDetail(result.detail);
            setActiveDesignId(result.id);
            setDraftVersion(result.detail.draftVersion);
          }

          // Invalidate owner content caches so the new/updated item appears in the
          // correct tab (e.g. In Review) and is removed from any stale Public list.
          //
          // refetchType: 'all' is load-bearing, not defensive. The default is
          // 'active', which only refetches queries that have a mounted observer
          // at THIS instant — and the owner catalog tabs are lazy, so the tab the
          // new design belongs to (In Review / Drafts) usually has none yet. Those
          // queries were then merely marked invalidated, and because the client
          // sets `refetchOnMount: false` globally (a deliberate perf policy,
          // pinned by scripts/check-perf-regressions.cjs), mounting the tab did
          // NOT fetch either: it rendered the stale cached list. Net effect was
          // that a freshly created design stayed invisible until the user
          // pull-to-refreshed — which worked only because pull-to-refresh
          // invalidates while the screen IS active. 'all' refetches inactive
          // queries too, so the list is already correct when the tab mounts.
          const refetchEverywhere = { refetchType: 'all' } as const;
          void queryClient.invalidateQueries({ queryKey: ['brand', 'collections'], ...refetchEverywhere });
          void queryClient.invalidateQueries({ queryKey: ['designs', 'user'], ...refetchEverywhere });
          void queryClient.invalidateQueries({ queryKey: ['design', 'detail', result.id], ...refetchEverywhere });

          router.replace({
            pathname: '/catalog',
            params: { tab: 'Collections', visibility: targetVisibility },
          } as any);
        } catch (error: any) {
          const draftFallback = 'We couldn’t save this draft. Please try again.';
          const publishFallback = 'We couldn’t publish this design. Please try again.';
          const message = extractApiErrorMessage(
            error,
            action === 'publish' ? publishFallback : draftFallback,
          );
          updateDesignEditorBackgroundTask(task.id, {
            status: 'failed',
            progress: 1,
            message: action === 'publish' ? 'Publish failed.' : 'Draft save failed.',
            error: message,
          });
          if (action === 'publish') {
            const username = user?.username || user?.firstName || user?.brandFullName || 'there';
            toast.error(`Hello ${username}, your upload ${titleForTask || 'design'} was not successful. Tap to review.`, {
              duration: 9000,
              actionLabel: 'Review',
              onPress: () => {
                router.push({
                  pathname: '/catalog',
                  params: { tab: 'Collections', visibility: 'In Review' },
                } as any);
              },
            });
          } else {
            toast.error(message);
          }
        } finally {
          isSavingRef.current = false;
          if (mountedRef.current) {
            setSaveAction(null);
          }
        }
      } catch (error: any) {
        const draftFallback = 'We couldn’t save this draft. Please try again.';
        const publishFallback = 'We couldn’t publish this design. Please try again.';
        const message = extractApiErrorMessage(
          error,
          action === 'publish' ? publishFallback : draftFallback,
        );
        toast.error(
          action === 'publish' ? mapCreatorMetadataError(message, publishFallback) : message,
        );
        isSavingRef.current = false;
        if (mountedRef.current) {
          setSaveAction(null);
        }
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
      normalizedRecoveryTaskId,
      publishValidationMessage,
      saveAction,
      selectedCustomOrderConfigurationId,
      selectedFilterValueIds,
      tags,
      toast,
      user,
      userEmailVerified,
      hasActiveBrandMembership,
    ],
  );

  const deleteDraft = useCallback(async () => {
    // Synchronous ref guard prevents a double-press from firing two deletes
    // before the async saveAction state has a chance to disable the button.
    if (saveAction || isSavingRef.current) {
      return;
    }
    if (!activeDesignId) {
      toast.error('No draft is open.');
      return;
    }
    if (activeDesignStatus !== 'DRAFT') {
      toast.error('Live designs cannot be deleted as drafts.');
      return;
    }

    isSavingRef.current = true;
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
      isSavingRef.current = false;
      setSaveAction(null);
      setSaveMessage('');
      setSaveProgress(0);
    }
  }, [activeDesignId, activeDesignStatus, saveAction, toast]);

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
