import { apiClient } from '@/src/api/httpClient';
import {
  getRequiredLegalAcceptances,
  LEGAL_CONTENT_PUBLISH_DOCUMENT_KEYS,
} from '@/src/api/LegalApi';
import {
  DESIGN_EDITOR_MAX_MEDIA,
  normalizeMediaViewSlot,
  toBackendMediaViewSlot,
  type BackendMediaViewSlot,
  type ContentPublicationStatus,
  type MediaViewSlot,
} from '@/src/features/design-editor/designCreationRules';
import {
  MOBILE_UPLOAD_POLICIES,
  assertValidPickedUploadAssets,
} from '@/src/utils/uploadValidation';

export type MobileDesignAsset = {
  id: string;
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  mediaKind: 'image' | 'video';
  viewSlot?: MediaViewSlot | string | null;
};

export type DesignEditorAsset = MobileDesignAsset & {
  existingMediaId?: string;
  remoteFileId?: string | null;
  remoteUrl?: string | null;
  aspectRatio?: number | null;
};

export type DesignCategoryOption = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  subCategories: Array<{
    id: string;
    slug: string;
    name: string;
    description?: string | null;
  }>;
};

export type FilterValueOption = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  order?: number;
};

export type FilterDimensionOption = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  isMulti: boolean;
  appliesTo: string[];
  values: FilterValueOption[];
};

export type MeasurementPointOption = {
  id: string;
  key: string;
  label: string;
  category?: string | null;
  gender?: 'MEN' | 'WOMEN' | 'UNISEX' | null;
  description?: string | null;
};

export type DesignFilterSelection = Record<string, string[]>;

const V1_EXCLUDED_CATEGORY_SLUGS = new Set([
  'accessories',
  'accessory',
  'footwear',
  'shoes',
  'shoe',
  'bags',
  'bag',
  'jewelry',
  'jewellery',
  'watches',
  'watch',
  'cosmetics',
  'beauty',
  'perfume',
  'perfumes',
]);

const normalizeTaxonomyToken = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function filterV1GarmentCategories<T extends { slug?: string | null; name?: string | null; id?: string | null }>(
  categories: T[],
): T[] {
  return categories.filter((category) => {
    const slug = normalizeTaxonomyToken(category.slug);
    const name = normalizeTaxonomyToken(category.name);
    const id = normalizeTaxonomyToken(category.id);
    return !(
      V1_EXCLUDED_CATEGORY_SLUGS.has(slug) ||
      V1_EXCLUDED_CATEGORY_SLUGS.has(name) ||
      V1_EXCLUDED_CATEGORY_SLUGS.has(id)
    );
  });
}

export type DraftSessionResponse = {
  designId?: string;
  id?: string;
  legacyCollectionId?: string;
  collectionId?: string;
  sessionToken: string;
  hasConflict: boolean;
  conflictDetails?: {
    existingSessionToken?: string;
    deviceName?: string;
    deviceType?: 'desktop' | 'tablet' | 'mobile';
    startedAt: string;
    userId?: string;
  };
};

export type DesignDetail = {
  id: string;
  title: string;
  description: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  type: 'MALE' | 'FEMALE' | 'EVERYBODY';
  status: ContentPublicationStatus;
  categoryId: string;
  subCategoryId: string;
  filterSelection: DesignFilterSelection;
  filterValueIds: string[];
  tags: string[];
  minPrice?: number;
  maxPrice?: number;
  sizingMode: 'NONE' | 'RTW' | 'CUSTOM' | 'RTW_PLUS_FITTINGS';
  customOrderEnabled: boolean;
  customMeasurementKeys: string[];
  fitPreference?: 'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED' | null;
  targetAgeGroup?: 'ADULT' | 'CHILD' | null;
  draftVersion?: number;
  coverMediaId?: string | null;
  metadataEditedAt?: string | null;
  medias: Array<{
    id: string;
    fileId?: string | null;
    url?: string | null;
    previewUrl?: string | null;
    aspectRatio?: number | null;
    mediaType: 'image' | 'video';
    viewSlot?: MediaViewSlot | null;
  }>;
};

export type DesignSavePayload = {
  title: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  categoryId?: string;
  subCategoryId?: string;
  type: 'MALE' | 'FEMALE' | 'EVERYBODY';
  tags: string[];
  minPrice?: number;
  maxPrice?: number;
  sizingMode?: 'NONE' | 'RTW' | 'CUSTOM' | 'RTW_PLUS_FITTINGS';
  customOrderEnabled?: boolean;
  customMeasurementKeys?: string[];
  customOrderConfigurationTemplateId?: string;
  customOrderConfiguration?: DesignCustomOrderConfigurationInput;
  productionLeadDays?: number;
  buyerInstructionText?: string;
  fitPreference?: 'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED';
  targetAgeGroup?: 'ADULT' | 'CHILD';
  filterValueIds?: string[];
  assets: DesignEditorAsset[];
  coverMediaId?: string;
  action: 'draft' | 'publish';
  designId?: string;
  originalMediaIds?: string[];
  draftSessionToken?: string;
  draftVersion?: number;
};

export type DesignCustomOrderConfiguration = {
  id: string;
  title: string;
  sourceType: 'PRODUCT' | 'DESIGN';
  sourceId: string;
  isActive: boolean;
  buyerInstructionText?: string | null;
  requiredMeasurementKeys: string[];
  requiredFreeformPointIds: string[];
  resolvedRequiredMeasurementKeys: string[];
  requiredMeasurementPoints: Array<{
    id: string;
    key: string;
    label: string;
    description?: string | null;
  }>;
  fabricRuleBasisId?: string | null;
  baseProductionCharge: string;
  fabricCostPerYard: string;
  rushEnabled: boolean;
  rushFee?: string | null;
  rushProductionLeadDays?: number | null;
  productionLeadDays: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  deliveryScope: string;
  revisionPolicy: string;
  returnPolicy: string;
  defectPolicy: string;
  fabricSourcingMode: string;
  notes?: string | null;
  rules: Array<{
    priority: number;
    conditionsJson: Record<string, unknown>;
    outputYards: string;
    isFallback?: boolean;
  }>;
};

type PresignedUpload = {
  fileId: string;
  expectedKey: string;
  uploadUrl: string;
  uploadFields?: Record<string, string> | null;
  method?: 'POST' | 'PUT';
  viewSlot?: BackendMediaViewSlot | string | null;
};

export type InitializeDesignResponse = {
  designId?: string;
  id?: string;
  legacyCollectionId?: string;
  collectionId?: string;
  uploads: PresignedUpload[];
};

type UploadCompletion = {
  fileId: string;
  s3Key: string;
  actualSize: number;
  actualMimeType: string;
  viewSlot?: BackendMediaViewSlot;
};

export type DesignCustomOrderConfigurationInput = {
  title?: string;
  buyerInstructionText?: string;
  requiredMeasurementKeys: string[];
  requiredFreeformPointIds?: string[];
  baseProductionCharge: string;
  fabricCostPerYard: string;
  rushEnabled: boolean;
  rushFee?: string;
  rushProductionLeadDays?: number;
  productionLeadDays: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  deliveryScope: string;
  revisionPolicy: string;
  returnPolicy: string;
  defectPolicy: string;
  fabricSourcingMode: 'BRAND_SOURCED' | 'BUYER_SUPPLIED' | 'EITHER';
  notes?: string;
  rules: Array<{
    priority: number;
    conditionsJson: Record<string, unknown>;
    outputYards: string;
    isFallback?: boolean;
  }>;
};

const createIdempotencyKey = () =>
  `mob_design_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as Record<string, unknown>).data as T;
  }
  return payload as T;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => asString(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

export function resolveDesignIdFromInitializeResponse(
  response: Partial<InitializeDesignResponse> | null | undefined,
): string | null {
  return (
    asString(response?.designId) ??
    asString(response?.id) ??
    asString(response?.legacyCollectionId) ??
    asString(response?.collectionId)
  );
}

const normalizeSizingMode = (value: unknown): DesignDetail['sizingMode'] => {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'NONE' || raw === 'RTW' || raw === 'CUSTOM') {
    return raw;
  }
  return 'RTW_PLUS_FITTINGS';
};

const normalizeFitPreference = (value: unknown): DesignDetail['fitPreference'] => {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'SLIM' || raw === 'REGULAR' || raw === 'LOOSE' || raw === 'OVERSIZED') {
    return raw;
  }
  return null;
};

const normalizeTargetAgeGroup = (value: unknown): DesignDetail['targetAgeGroup'] => {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'CHILD') {
    return 'CHILD';
  }
  if (raw === 'ADULT') {
    return 'ADULT';
  }
  return null;
};

const normalizePublicationStatus = (value: unknown): ContentPublicationStatus => {
  const raw = String(value ?? '').toUpperCase();
  if (
    raw === 'PUBLISHED' ||
    raw === 'IN_REVIEW' ||
    raw === 'CHANGES_REQUESTED' ||
    raw === 'REJECTED' ||
    raw === 'FAILED' ||
    raw === 'ARCHIVED' ||
    raw === 'REMOVED'
  ) {
    return raw;
  }
  return 'DRAFT';
};

const normalizeCustomOrderConfiguration = (raw: unknown): DesignCustomOrderConfiguration | null => {
  const source = asRecord(unwrapData(raw));
  const id = asString(source.id);
  if (!id) return null;

  const fabricRuleBasis = asRecord(source.fabricRuleBasis);
  const requiredMeasurementPoints: DesignCustomOrderConfiguration['requiredMeasurementPoints'] = Array.isArray(source.requiredMeasurementPoints)
    ? source.requiredMeasurementPoints
        .reduce<DesignCustomOrderConfiguration['requiredMeasurementPoints']>((acc, entry) => {
          const point = asRecord(entry);
          const pointId = asString(point.id);
          const key = asString(point.key);
          if (!pointId || !key) return acc;
          acc.push({
            id: pointId,
            key,
            label: asString(point.label) ?? key,
            description: asString(point.description),
          });
          return acc;
        }, [])
    : [];

  const rules: DesignCustomOrderConfiguration['rules'] = Array.isArray(source.rules)
    ? source.rules
        .reduce<DesignCustomOrderConfiguration['rules']>((acc, entry) => {
          const rule = asRecord(entry);
          const priority = asNumber(rule.priority) ?? 1;
          const outputYards = asString(rule.outputYards) ?? String(rule.outputYards ?? '');
          if (!outputYards) return acc;
          acc.push({
            priority,
            conditionsJson: asRecord(rule.conditionsJson ?? rule.conditions),
            outputYards,
            isFallback: Boolean(rule.isFallback),
          });
          return acc;
        }, [])
    : [];

  const requiredMeasurementKeys = asStringList(source.requiredMeasurementKeys);
  const resolvedRequiredMeasurementKeys = asStringList(source.resolvedRequiredMeasurementKeys);

  return {
    id,
    title: asString(source.title) ?? 'Custom order configuration',
    sourceType: String(source.sourceType ?? '').toUpperCase() === 'PRODUCT' ? 'PRODUCT' : 'DESIGN',
    sourceId: asString(source.sourceId) ?? '',
    isActive: source.isActive !== false,
    buyerInstructionText: asString(source.buyerInstructionText),
    requiredMeasurementKeys,
    requiredFreeformPointIds: asStringList(source.requiredFreeformPointIds),
    resolvedRequiredMeasurementKeys: resolvedRequiredMeasurementKeys.length
      ? resolvedRequiredMeasurementKeys
      : requiredMeasurementKeys,
    requiredMeasurementPoints,
    fabricRuleBasisId: asString(source.fabricRuleBasisId) ?? asString(fabricRuleBasis.id),
    baseProductionCharge: asString(source.baseProductionCharge) ?? String(source.baseProductionCharge ?? ''),
    fabricCostPerYard: asString(source.fabricCostPerYard) ?? String(source.fabricCostPerYard ?? ''),
    rushEnabled: Boolean(source.rushEnabled),
    rushFee: asString(source.rushFee),
    rushProductionLeadDays: asNumber(source.rushProductionLeadDays) ?? null,
    productionLeadDays: asNumber(source.productionLeadDays) ?? 7,
    deliveryMinDays: asNumber(source.deliveryMinDays) ?? 2,
    deliveryMaxDays: asNumber(source.deliveryMaxDays) ?? 7,
    deliveryScope: asString(source.deliveryScope) ?? 'Local delivery',
    revisionPolicy: asString(source.revisionPolicy) ?? 'Revision policy applies.',
    returnPolicy: asString(source.returnPolicy) ?? 'Return policy applies.',
    defectPolicy: asString(source.defectPolicy) ?? 'Defect policy applies.',
    fabricSourcingMode: asString(source.fabricSourcingMode) ?? 'BUYER_SUPPLIED',
    notes: asString(source.notes),
    rules,
  };
};

const unwrapItems = (payload: unknown): unknown[] => {
  const unwrapped = unwrapData<unknown>(payload);
  const record = asRecord(unwrapped);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (Array.isArray(record.items)) return record.items;
  return [];
};

const mapFilterSelection = (raw: unknown): DesignFilterSelection => {
  if (!Array.isArray(raw)) return {};
  return raw.reduce<DesignFilterSelection>((acc, entry) => {
    const item = asRecord(entry);
    const dimensionId = asString(item.dimensionId);
    const valueId = asString(item.valueId);
    if (!dimensionId || !valueId) return acc;
    if (!Array.isArray(acc[dimensionId])) {
      acc[dimensionId] = [];
    }
    if (!acc[dimensionId].includes(valueId)) {
      acc[dimensionId].push(valueId);
    }
    return acc;
  }, {});
};

const normalizeDetail = (payload: unknown): DesignDetail => {
  const source = asRecord(unwrapData(payload));
  const medias = Array.isArray(source.medias) ? source.medias : [];
  const designId =
    asString(source.designId) ??
    asString(source.id) ??
    asString(source.legacyCollectionId) ??
    asString(source.collectionId) ??
    '';

  return {
    id: designId,
    title: asString(source.title) ?? 'Untitled design',
    description: asString(source.description) ?? '',
    visibility: String(source.visibility ?? '').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
    type:
      String(source.type ?? '').toUpperCase() === 'MALE'
        ? 'MALE'
        : String(source.type ?? '').toUpperCase() === 'FEMALE'
          ? 'FEMALE'
          : 'EVERYBODY',
    status: normalizePublicationStatus(source.publicationStatus ?? source.status),
    categoryId: asString(source.categoryId) ?? '',
    subCategoryId: asString(source.subCategoryId) ?? asString(source.categoryTypeId) ?? '',
    filterSelection: mapFilterSelection(source.filters),
    filterValueIds: asStringList(source.filterValueIds),
    tags: asStringList(source.tags),
    minPrice: asNumber(source.minPrice),
    maxPrice: asNumber(source.maxPrice),
    sizingMode: normalizeSizingMode(source.sizingMode),
    customOrderEnabled: Boolean(source.customOrderEnabled),
    customMeasurementKeys: asStringList(source.customMeasurementKeys),
    fitPreference: normalizeFitPreference(source.fitPreference),
    targetAgeGroup: normalizeTargetAgeGroup(source.targetAgeGroup),
    draftVersion: asNumber(source.draftVersion),
    coverMediaId: asString(source.coverMediaId),
    metadataEditedAt: asString(source.metadataEditedAt),
    medias: medias.map((entry) => {
      const item = asRecord(entry);
      const file = asRecord(item.file);
      return {
        id: String(item.id ?? ''),
        fileId: asString(file.id) ?? asString(item.fileId),
        url: asString(file.s3Url) ?? asString(file.url) ?? asString(item.url),
        previewUrl:
          asString(item.previewUrl) ??
          asString(file.s3Url) ??
          asString(file.url) ??
          asString(item.url),
        aspectRatio: asNumber(item.aspectRatio),
        mediaType:
          String(item.type ?? item.mediaType ?? '').toUpperCase().includes('VIDEO') ? 'video' : 'image',
        viewSlot: normalizeMediaViewSlot(asString(item.viewSlot) ?? asString(item.view_slot)),
      };
    }),
  };
};

const buildMetadata = (payload: DesignSavePayload) => ({
  title: payload.title.trim() || 'Untitled design',
  description: payload.description?.trim() || undefined,
  visibility: payload.visibility,
  type: payload.type,
  categoryId: payload.categoryId,
  subCategoryId: payload.subCategoryId,
  categoryTypeId: payload.subCategoryId,
  tags: payload.tags,
  filterValueIds: payload.filterValueIds,
  sizingMode: payload.sizingMode,
  customOrderEnabled: payload.customOrderEnabled,
  customMeasurementKeys: payload.customMeasurementKeys,
  fitPreference: payload.fitPreference,
  targetAgeGroup: payload.targetAgeGroup,
});

export function resolvePresignedUploadMethod(upload: Pick<PresignedUpload, 'method' | 'uploadFields'>): 'POST' | 'PUT' {
  return upload.method ?? (upload.uploadFields ? 'POST' : 'PUT');
}

async function uploadDesignAsset(
  upload: PresignedUpload,
  asset: MobileDesignAsset,
): Promise<UploadCompletion> {
  const method = resolvePresignedUploadMethod(upload);

  if (method === 'POST') {
    const formData = new FormData();
    for (const [key, value] of Object.entries(upload.uploadFields ?? {})) {
      formData.append(key, value);
    }
    formData.append('file', {
      uri: asset.uri,
      type: asset.mimeType,
      name: asset.fileName,
    } as any);

    const response = await fetch(upload.uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  } else {
    const fileResponse = await fetch(asset.uri);
    const blob = await fileResponse.blob();
    const response = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': asset.mimeType },
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  }

  return {
    fileId: upload.fileId,
    s3Key: upload.expectedKey,
    actualSize: asset.fileSize,
    actualMimeType: asset.mimeType,
    viewSlot: toBackendMediaViewSlot(upload.viewSlot ?? asset.viewSlot),
  };
}

async function initializeNewDesignUploads(payload: DesignSavePayload): Promise<InitializeDesignResponse> {
  const response = await apiClient.post('/designs/initialize', {
    ...buildMetadata(payload),
    minPrice: payload.minPrice,
    maxPrice: payload.maxPrice,
    files: payload.assets.map((asset) => ({
      name: asset.fileName,
      type: asset.mimeType,
      size: asset.fileSize,
      viewSlot: toBackendMediaViewSlot(asset.viewSlot),
    })),
    isAvailableInStore: false,
    draftOnly: payload.action === 'draft',
  });

  return unwrapData<InitializeDesignResponse>(response.data);
}

export async function getDesignCategories(): Promise<DesignCategoryOption[]> {
  const response = await apiClient.get('/categories');
  const payload = unwrapData<unknown>(response.data);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).items)
      ? asRecord(payload).items
      : [];

  return filterV1GarmentCategories(items.map((entry: any) => ({
    id: String(entry?.id ?? ''),
    slug: String(entry?.slug ?? ''),
    name: String(entry?.name ?? ''),
    description: typeof entry?.description === 'string' ? entry.description : null,
    subCategories: Array.isArray(entry?.subCategories)
      ? entry.subCategories.map((item: any) => ({
          id: String(item?.id ?? ''),
          slug: String(item?.slug ?? ''),
          name: String(item?.name ?? ''),
          description: typeof item?.description === 'string' ? item.description : null,
        }))
      : [],
  })));
}

export async function getDesignFilterDimensions(): Promise<FilterDimensionOption[]> {
  const response = await apiClient.get('/categories/filters');
  const payload = unwrapData<unknown>(response.data);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).items)
      ? asRecord(payload).items
      : [];

  return items
    .map((entry: any) => ({
      id: String(entry?.id ?? ''),
      slug: String(entry?.slug ?? ''),
      name: String(entry?.name ?? ''),
      description: typeof entry?.description === 'string' ? entry.description : null,
      isMulti: entry?.isMulti !== false,
      appliesTo: Array.isArray(entry?.appliesTo) ? entry.appliesTo.map(String) : [],
      values: Array.isArray(entry?.values)
        ? entry.values.map((value: any) => ({
            id: String(value?.id ?? ''),
            slug: String(value?.slug ?? ''),
            name: String(value?.name ?? ''),
            description: typeof value?.description === 'string' ? value.description : null,
            order: typeof value?.order === 'number' ? value.order : undefined,
          }))
        : [],
    }))
    .filter((dimension: FilterDimensionOption) => dimension.id.length > 0);
}

export async function getMeasurementPoints(params?: {
  gender?: 'MEN' | 'WOMEN' | 'UNISEX';
}): Promise<MeasurementPointOption[]> {
  const response = await apiClient.get('/measurement-points', { params });
  const payload = unwrapData<unknown>(response.data);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).items)
      ? asRecord(payload).items
      : [];

  return items.map((entry: any) => ({
    id: String(entry?.id ?? ''),
    key: String(entry?.key ?? ''),
    label: String(entry?.label ?? ''),
    category: typeof entry?.category === 'string' ? entry.category : null,
    gender:
      entry?.gender === 'MEN' || entry?.gender === 'WOMEN' || entry?.gender === 'UNISEX'
        ? entry.gender
        : null,
    description: typeof entry?.description === 'string' ? entry.description : null,
  }));
}

export async function getVisibleCustomOrderConfigurations(limit = 50): Promise<DesignCustomOrderConfiguration[]> {
  const response = await apiClient.get('/custom-order-configurations', {
    params: { page: 1, limit, isActive: true },
  });
  return unwrapItems(response.data)
    .map((entry) => normalizeCustomOrderConfiguration(entry))
    .filter((entry): entry is DesignCustomOrderConfiguration => Boolean(entry));
}

export async function getCustomOrderConfigurationById(
  configurationId: string,
): Promise<DesignCustomOrderConfiguration | null> {
  try {
    const response = await apiClient.get(`/custom-order-configurations/${configurationId}`);
    return normalizeCustomOrderConfiguration(response.data);
  } catch (error: any) {
    if (Number(error?.response?.status) === 404) return null;
    throw error;
  }
}

export async function getActiveDesignCustomConfiguration(
  designId: string,
): Promise<DesignCustomOrderConfiguration | null> {
  try {
    const response = await apiClient.get(`/designs/${designId}/custom-order-configuration`);
    return normalizeCustomOrderConfiguration(response.data);
  } catch (error: any) {
    if (Number(error?.response?.status) === 404) return null;
    throw error;
  }
}

function buildConfigurationCreatePayload(
  template: DesignCustomOrderConfiguration,
  designId: string,
  requiredMeasurementKeys: string[],
  overrides?: {
    productionLeadDays?: number;
    buyerInstructionText?: string;
  },
) {
  if (!template.baseProductionCharge || !template.fabricCostPerYard || template.rules.length === 0) {
    throw new Error('Selected custom-order configuration is incomplete.');
  }

  return {
    sourceType: 'DESIGN',
    sourceId: designId,
    title: template.title,
    buyerInstructionText: overrides?.buyerInstructionText ?? template.buyerInstructionText ?? undefined,
    requiredMeasurementKeys,
    requiredFreeformPointIds: [],
    baseProductionCharge: template.baseProductionCharge,
    fabricCostPerYard: template.fabricCostPerYard,
    rushEnabled: template.rushEnabled,
    rushFee: template.rushFee ?? undefined,
    rushProductionLeadDays: template.rushProductionLeadDays ?? undefined,
    productionLeadDays: overrides?.productionLeadDays ?? template.productionLeadDays,
    deliveryMinDays: template.deliveryMinDays,
    deliveryMaxDays: template.deliveryMaxDays,
    deliveryScope: template.deliveryScope,
    revisionPolicy: template.revisionPolicy,
    returnPolicy: template.returnPolicy,
    defectPolicy: template.defectPolicy,
    fabricSourcingMode: template.fabricSourcingMode,
    notes: template.notes ?? undefined,
    rules: template.rules,
  };
}

async function createDesignCustomOrderConfigurationFromTemplate(args: {
  designId: string;
  templateId: string;
  requiredMeasurementKeys: string[];
  productionLeadDays?: number;
  buyerInstructionText?: string;
}): Promise<DesignCustomOrderConfiguration> {
  const template = await getCustomOrderConfigurationById(args.templateId);
  if (!template) {
    throw new Error('Selected custom-order configuration could not be found.');
  }

  const keys = args.requiredMeasurementKeys.length
    ? args.requiredMeasurementKeys
    : template.resolvedRequiredMeasurementKeys;
  const response = await apiClient.post(
    '/custom-order-configurations',
    buildConfigurationCreatePayload(template, args.designId, keys, {
      productionLeadDays: args.productionLeadDays,
      buyerInstructionText: args.buyerInstructionText,
    }),
  );
  const configuration = normalizeCustomOrderConfiguration(response.data);
  if (!configuration) {
    throw new Error('Custom-order configuration could not be created for this design.');
  }
  return configuration;
}

async function updateDesignCustomOrderConfiguration(
  configurationId: string,
  updates: Partial<DesignCustomOrderConfigurationInput>,
): Promise<DesignCustomOrderConfiguration> {
  const response = await apiClient.patch(`/custom-order-configurations/${configurationId}`, updates);
  const configuration = normalizeCustomOrderConfiguration(response.data);
  if (!configuration) {
    throw new Error('Custom-order configuration could not be updated.');
  }
  return configuration;
}

async function ensureDesignCustomOrderConfiguration(
  designId: string,
  payload: DesignSavePayload,
): Promise<DesignCustomOrderConfiguration | null> {
  if (!payload.customOrderEnabled) return null;

  const active = await getActiveDesignCustomConfiguration(designId);
  const keys = payload.customMeasurementKeys ?? [];
  if (active) {
    if (payload.customOrderConfiguration) {
      return updateDesignCustomOrderConfiguration(active.id, {
        ...payload.customOrderConfiguration,
        requiredMeasurementKeys: keys,
      });
    }
    return active;
  }

  if (payload.customOrderConfiguration) {
    const response = await apiClient.post('/custom-order-configurations', {
      sourceType: 'DESIGN',
      sourceId: designId,
      ...payload.customOrderConfiguration,
      requiredMeasurementKeys: keys,
    });
    const configuration = normalizeCustomOrderConfiguration(response.data);
    if (!configuration) {
      throw new Error('Custom-order configuration could not be created for this design.');
    }
    return configuration;
  }

  if (!payload.customOrderConfigurationTemplateId) {
    throw new Error('Complete custom order settings before publishing custom orders.');
  }

  return createDesignCustomOrderConfigurationFromTemplate({
    designId,
    templateId: payload.customOrderConfigurationTemplateId,
    requiredMeasurementKeys: keys,
    productionLeadDays: payload.productionLeadDays,
    buyerInstructionText: payload.buyerInstructionText,
  });
}

export async function getDesignDetail(
  designId: string,
  options?: { forceRefresh?: boolean },
): Promise<DesignDetail> {
  const response = await apiClient.get(
    `/designs/${designId}`,
    options?.forceRefresh
      ? {
          params: { _cb: Date.now() },
          headers: {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
        }
      : undefined,
  );
  return normalizeDetail(response.data);
}

export async function startDesignDraftSession(
  designId: string,
  options?: {
    deviceName?: string;
    forceNew?: boolean;
    existingToken?: string;
  },
): Promise<DraftSessionResponse> {
  const response = await apiClient.post(`/designs/${designId}/draft-session`, {
    deviceName: options?.deviceName ?? 'WEAZ mobile',
    forceNew: options?.forceNew ?? false,
    existingToken: options?.existingToken,
  });
  return unwrapData<DraftSessionResponse>(response.data);
}

export async function updateDesign(
  designId: string,
  payload: Omit<DesignSavePayload, 'assets' | 'action' | 'designId'>,
) {
  const response = await apiClient.patch(`/designs/${designId}`, {
    ...buildMetadata({
      ...payload,
      assets: [],
      action: 'draft',
    }),
    minPrice: payload.minPrice,
    maxPrice: payload.maxPrice,
    draftSessionToken: payload.draftSessionToken,
    draftVersion: payload.draftVersion,
  });
  return unwrapData<unknown>(response.data);
}

export async function initializeExistingDesignMediaUploads(
  designId: string,
  assets: MobileDesignAsset[],
): Promise<InitializeDesignResponse> {
  const response = await apiClient.post(`/designs/${designId}/media/initialize`, {
    files: assets.map((asset) => ({
      name: asset.fileName,
      type: asset.mimeType,
      size: asset.fileSize,
      viewSlot: toBackendMediaViewSlot(asset.viewSlot),
    })),
  });
  return unwrapData<InitializeDesignResponse>(response.data);
}

export async function finalizeExistingDesign(
  designId: string,
  payload: Omit<DesignSavePayload, 'designId'>,
  completions: UploadCompletion[],
) {
  const response = await apiClient.post(
    `/designs/${designId}/finalize`,
    {
      completions,
      shouldPublish: payload.action === 'publish',
      action: payload.action,
      designMetadata: buildMetadata(payload),
      coverMediaId: undefined,
      coverIndex: 0,
      draftSessionToken: payload.draftSessionToken,
      draftVersion: payload.draftVersion,
    },
    {
      headers: { 'Idempotency-Key': createIdempotencyKey() },
    },
  );

  return unwrapData<unknown>(response.data);
}

export async function acknowledgeContentPolicy() {
  const legalAcceptances = await getRequiredLegalAcceptances(
    LEGAL_CONTENT_PUBLISH_DOCUMENT_KEYS,
  );
  await apiClient.post('/store/content-policy/acknowledge', {
    legalAcceptances,
  });
}

export async function reorderDesignMedia(designId: string, mediaIds: string[]) {
  const response = await apiClient.patch(`/designs/${designId}/reorder-media`, {
    items: mediaIds.map((mediaId, orderIndex) => ({
      mediaId,
      orderIndex,
    })),
  });
  return unwrapData<unknown>(response.data);
}

export async function deleteDesignMedia(designId: string, mediaId: string) {
  await apiClient.delete(`/designs/${designId}/media/${mediaId}`);
}

export async function deleteDesign(designId: string) {
  await apiClient.delete(`/designs/${designId}`);
}

export async function saveDesignEditor(
  payload: DesignSavePayload,
  onProgress?: (value: number, message: string) => void,
): Promise<{ id: string; detail: DesignDetail }> {
  const trimmedTitle = payload.title.trim() || 'Untitled design';
  const filteredAssets = payload.assets.slice(0, DESIGN_EDITOR_MAX_MEDIA);
  const localAssets = filteredAssets.filter((asset) => !asset.existingMediaId);
  const existingMediaIds = filteredAssets
    .map((asset) => asset.existingMediaId)
    .filter((asset): asset is string => Boolean(asset));
  assertValidPickedUploadAssets(localAssets, MOBILE_UPLOAD_POLICIES.designMedia, {
    existingCount: existingMediaIds.length,
    maxFiles: DESIGN_EDITOR_MAX_MEDIA,
  });

  if (payload.action === 'publish') {
    await acknowledgeContentPolicy();
  }

  if (!payload.designId) {
    onProgress?.(0.1, 'Creating design draft...');
    const initialized = await initializeNewDesignUploads({
      ...payload,
      title: trimmedTitle,
      assets: filteredAssets,
    });
    const designId = resolveDesignIdFromInitializeResponse(initialized);

    if (!designId) {
      throw new Error('The design draft could not be created.');
    }

    const uploads = Array.isArray(initialized.uploads) ? initialized.uploads : [];
    const completions: UploadCompletion[] = [];

    for (let index = 0; index < uploads.length; index += 1) {
      const upload = uploads[index];
      const asset = filteredAssets[index];
      if (!asset) continue;
      onProgress?.(
        0.2 + ((index + 1) / Math.max(uploads.length, 1)) * 0.55,
        uploads.length > 1 ? `Uploading media ${index + 1} of ${uploads.length}...` : 'Uploading media...',
      );
      completions.push(await uploadDesignAsset(upload, asset));
    }

    if (payload.action === 'publish' && payload.customOrderEnabled) {
      onProgress?.(0.78, 'Preparing custom orders...');
      await ensureDesignCustomOrderConfiguration(designId, payload);
    }

    onProgress?.(0.82, payload.action === 'publish' ? 'Publishing design...' : 'Saving draft...');
    await finalizeExistingDesign(
      designId,
      {
        ...payload,
        title: trimmedTitle,
        assets: filteredAssets,
      },
      completions,
    );

    const detail = await getDesignDetail(designId, { forceRefresh: true });
    onProgress?.(1, payload.action === 'publish' ? 'Design published.' : 'Draft saved.');
    return { id: designId, detail };
  }

  onProgress?.(0.12, 'Saving design metadata...');
  await updateDesign(payload.designId, {
    ...payload,
    title: trimmedTitle,
  });

  const removedExistingMediaIds = (payload.originalMediaIds ?? []).filter(
    (mediaId) => !existingMediaIds.includes(mediaId),
  );
  if (removedExistingMediaIds.length > 0) {
    onProgress?.(0.2, 'Removing deleted media...');
    await Promise.all(
      removedExistingMediaIds.map((mediaId) => deleteDesignMedia(payload.designId!, mediaId)),
    );
  }

  const initialized =
    localAssets.length > 0
      ? await initializeExistingDesignMediaUploads(payload.designId, localAssets)
      : { designId: payload.designId, id: payload.designId, uploads: [] };

  const uploads = Array.isArray(initialized.uploads) ? initialized.uploads : [];
  const completions: UploadCompletion[] = [];

  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index];
    const asset = localAssets[index];
    if (!asset) continue;
    onProgress?.(
      0.24 + ((index + 1) / Math.max(uploads.length, 1)) * 0.36,
      uploads.length > 1 ? `Uploading media ${index + 1} of ${uploads.length}...` : 'Uploading media...',
    );
    completions.push(await uploadDesignAsset(upload, asset));
  }

  if (payload.action === 'publish' && payload.customOrderEnabled) {
    onProgress?.(0.66, 'Preparing custom orders...');
    await ensureDesignCustomOrderConfiguration(payload.designId, payload);
  }

  onProgress?.(0.7, payload.action === 'publish' ? 'Finalizing design...' : 'Saving draft...');
  await finalizeExistingDesign(
    payload.designId,
    {
      ...payload,
      title: trimmedTitle,
    },
    completions,
  );

  const detail = await getDesignDetail(payload.designId, { forceRefresh: true });
  const finalMediaIds = detail.medias.map((media) => media.id);
  const orderedExistingMediaIds = filteredAssets
    .map((asset) => asset.existingMediaId)
    .filter((mediaId): mediaId is string => Boolean(mediaId && finalMediaIds.includes(mediaId)));
  const appendedMediaIds = finalMediaIds.filter((mediaId) => !orderedExistingMediaIds.includes(mediaId));
  const nextOrder = [...orderedExistingMediaIds, ...appendedMediaIds];

  if (nextOrder.length > 0 && nextOrder.length === finalMediaIds.length) {
    const hasSameOrder = nextOrder.every((mediaId, index) => mediaId === finalMediaIds[index]);
    if (!hasSameOrder) {
      await reorderDesignMedia(payload.designId, nextOrder);
    }
  }

  onProgress?.(1, payload.action === 'publish' ? 'Design published.' : 'Draft saved.');
  return { id: payload.designId, detail: await getDesignDetail(payload.designId, { forceRefresh: true }) };
}
