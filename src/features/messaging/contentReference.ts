/**
 * The content a message is about, carried from the screen it was composed on
 * into the thread, the send payload, and back out of a stored message.
 *
 * A remark is written where its subject is on screen — "can this be made in
 * navy?" typed under a design is a complete thought. In the inbox it is not:
 * the brand sees a sentence about nothing, and answering it means asking the
 * shopper which of forty pieces they meant. Nobody should have to memorise
 * content names to be understood.
 *
 * So the reference travels. Four hops, one shape:
 *
 *   content screen → route params → send payload → message metadata → card
 *
 * Every hop used to be hand-rolled at the call site, which is why the product
 * half was simply missing and the design half only worked from one screen.
 * These functions are the whole contract; a new surface that wants to reference
 * content imports them rather than inventing its own param names.
 */

export type MessageContentKind = 'DESIGN' | 'PRODUCT';

export type MessageContentReference = {
  kind: MessageContentKind;
  id: string;
  title?: string | null;
  coverUrl?: string | null;
  coverFileId?: string | null;
};

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Route params understood by `/messages/[threadId]`. */
export const CONTENT_REF_PARAM_KEYS = [
  'refKind',
  'refId',
  'refTitle',
  'refCoverUrl',
  'refCoverFileId',
] as const;

export function contentReferenceToParams(
  reference: MessageContentReference | null | undefined,
): Record<string, string> {
  if (!reference?.id) return {};
  const params: Record<string, string> = {
    refKind: reference.kind,
    refId: reference.id,
  };
  if (clean(reference.title)) params.refTitle = clean(reference.title);
  if (clean(reference.coverUrl)) params.refCoverUrl = clean(reference.coverUrl);
  if (clean(reference.coverFileId)) {
    params.refCoverFileId = clean(reference.coverFileId);
  }
  return params;
}

/** Expo Router hands params back as `string | string[]`. */
const firstParam = (value: string | string[] | undefined): string =>
  clean(Array.isArray(value) ? value[0] : value);

export function contentReferenceFromParams(params: {
  refKind?: string | string[];
  refId?: string | string[];
  refTitle?: string | string[];
  refCoverUrl?: string | string[];
  refCoverFileId?: string | string[];
}): MessageContentReference | null {
  const id = firstParam(params.refId);
  const kind = firstParam(params.refKind).toUpperCase();
  if (!id || (kind !== 'DESIGN' && kind !== 'PRODUCT')) return null;

  return {
    kind: kind as MessageContentKind,
    id,
    title: firstParam(params.refTitle) || null,
    coverUrl: firstParam(params.refCoverUrl) || null,
    coverFileId: firstParam(params.refCoverFileId) || null,
  };
}

/**
 * The `context*` fields the send endpoints accept.
 *
 * Design and product are separate field families on the DTO rather than one
 * generic pair, because both clients already read the design keys by name and
 * unifying them would have meant rewriting metadata already stored on messages.
 */
export function contentReferenceToSendFields(
  reference: MessageContentReference | null | undefined,
): Record<string, string> {
  if (!reference?.id) return {};
  const prefix = reference.kind === 'PRODUCT' ? 'contextProduct' : 'contextDesign';
  const fields: Record<string, string> = { [`${prefix}Id`]: reference.id };
  if (clean(reference.title)) fields[`${prefix}Title`] = clean(reference.title);
  if (clean(reference.coverFileId)) {
    fields[`${prefix}CoverFileId`] = clean(reference.coverFileId);
  }
  if (clean(reference.coverUrl)) {
    fields[`${prefix}CoverUrl`] = clean(reference.coverUrl);
  }
  return fields;
}

/** Read a reference back off a stored message's `metadataJson`. */
export function contentReferenceFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): MessageContentReference | null {
  if (!metadata) return null;

  const productId = clean(metadata.contextProductId);
  if (productId) {
    return {
      kind: 'PRODUCT',
      id: productId,
      title: clean(metadata.contextProductTitle) || null,
      coverUrl: clean(metadata.contextProductCoverUrl) || null,
      coverFileId: clean(metadata.contextProductCoverFileId) || null,
    };
  }

  const designId = clean(metadata.contextDesignId);
  const designTitle = clean(metadata.contextDesignTitle);
  /*
    Title alone still counts. Messages sent before the id was recorded carry
    only a title, and a card naming the piece is worth more than no card — it
    just cannot be opened, which `contentReferenceRoute` handles by returning
    null for it.
  */
  if (!designId && !designTitle) return null;

  return {
    kind: 'DESIGN',
    id: designId,
    title: designTitle || null,
    coverUrl: clean(metadata.contextDesignCoverUrl) || null,
    coverFileId: clean(metadata.contextDesignCoverFileId) || null,
  };
}

/**
 * Where tapping the card goes: the content ITSELF, not the brand's tab of
 * contents. Landing a reader on a grid and asking them to find the piece again
 * is the problem the reference exists to remove.
 */
export function contentReferenceRoute(
  reference: MessageContentReference | null | undefined,
): { pathname: string; params: Record<string, string> } | null {
  if (!reference?.id) return null;

  if (reference.kind === 'PRODUCT') {
    return {
      pathname: '/products/[productId]',
      params: { productId: reference.id },
    };
  }

  return {
    pathname: '/market-viewer',
    params: { sourceType: 'DESIGN', sourceId: reference.id },
  };
}

/** What the card calls the content when no title was captured. */
export function contentReferenceLabel(
  reference: MessageContentReference,
): string {
  return (
    clean(reference.title) ||
    (reference.kind === 'PRODUCT' ? 'Product' : 'Design')
  );
}
