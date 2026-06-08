import { apiClient } from '@/src/api/httpClient';

export type LegalDocumentKey =
  | 'TERMS_OF_SERVICE'
  | 'PRIVACY_POLICY'
  | 'COOKIE_POLICY'
  | 'COMMUNITY_GUIDELINES'
  | 'SELLER_TERMS'
  | 'STORE_GUIDELINES'
  | 'BUYER_POLICY'
  | 'PAYMENT_POLICY'
  | 'COPYRIGHT_POLICY'
  | 'ACCOUNT_DELETION_POLICY'
  | 'CONTENT_POLICY';

export type LegalAcceptancePayload = {
  documentKey: LegalDocumentKey;
  version: string;
};

export type LegalDocumentDefinition = {
  key: LegalDocumentKey;
  title: string;
  slug: string;
  route: string;
  version: string;
  effectiveDate: string;
  owner: 'legal' | 'trust-safety' | 'payments' | 'commerce';
  requiresCounselReview: boolean;
};

export type LegalVersionsResponse = {
  documents: LegalDocumentDefinition[];
  required: {
    signup: LegalDocumentKey[];
    checkout: LegalDocumentKey[];
    storePublish: LegalDocumentKey[];
    contentPublish: LegalDocumentKey[];
  };
};

export const LEGAL_SIGNUP_DOCUMENT_KEYS: LegalDocumentKey[] = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
];

export const LEGAL_PAYMENT_DOCUMENT_KEYS: LegalDocumentKey[] = [
  'PAYMENT_POLICY',
];

export const LEGAL_CONTENT_PUBLISH_DOCUMENT_KEYS: LegalDocumentKey[] = [
  'CONTENT_POLICY',
  'COMMUNITY_GUIDELINES',
  'COPYRIGHT_POLICY',
];

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

let cachedVersions: Promise<LegalVersionsResponse> | null = null;

export async function getLegalVersions(options?: { forceRefresh?: boolean }) {
  if (!cachedVersions || options?.forceRefresh) {
    cachedVersions = apiClient
      .get('/legal/versions')
      .then((response) => unwrapData<LegalVersionsResponse>(response.data));
  }
  return cachedVersions;
}

export async function getRequiredLegalAcceptances(
  requiredKeys: LegalDocumentKey[],
): Promise<LegalAcceptancePayload[]> {
  const versions = await getLegalVersions();
  const byKey = new Map(versions.documents.map((document) => [document.key, document]));
  return requiredKeys.map((documentKey) => {
    const document = byKey.get(documentKey);
    if (!document) {
      throw new Error(`Legal document version is unavailable: ${documentKey}`);
    }
    return {
      documentKey,
      version: document.version,
    };
  });
}
