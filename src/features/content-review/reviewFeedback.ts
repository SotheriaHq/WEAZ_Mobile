import { useQuery } from '@tanstack/react-query';

import {
  contentIntegrityApi,
  type ContentReviewHistoryItem,
} from '@/src/api/ContentIntegrityApi';

/**
 * What the reviewer asked for, where the brand will act on it.
 *
 * A "changes requested" notification used to open the editor with nothing on
 * it about the review — the brand had to remember the notification text, find
 * the field themselves, and guess that "Create" meant "resubmit" (owner,
 * Nov 2026). The review lives in ContentSubmission as one reason code plus the
 * reviewer's note, so the editor now shows them at the top, marks the part of
 * the form the reason points at, and names the submit button for what it does.
 */

export type ReviewFocus = 'media' | 'details' | 'listing';

export type ReviewFeedback = {
  status: 'CHANGES_REQUESTED' | 'REJECTED';
  reasonLabel: string | null;
  reasonNote: string | null;
  focus: ReviewFocus;
  /** One sentence on what to do about it. */
  guidance: string;
  reviewedAt: string | null;
};

const MEDIA_REASONS = new Set([
  'POOR_IMAGE_QUALITY',
  'MISSING_REQUIRED_VIEW',
  'DUPLICATE_ANGLE',
  'MODEL_FABRIC_MISMATCH',
  'AI_OR_MANIPULATED_IMAGE_SUSPECTED',
]);
const DETAILS_REASONS = new Set(['WRONG_CATEGORY_OR_METADATA_MISMATCH']);

const GUIDANCE: Record<string, string> = {
  POOR_IMAGE_QUALITY: 'Replace the blurry or dark photos with clear, well-lit ones.',
  MISSING_REQUIRED_VIEW: 'Add the missing view so the piece is shown from every required angle.',
  DUPLICATE_ANGLE: 'Swap repeated angles for different views of the piece.',
  MODEL_FABRIC_MISMATCH: 'Use photos that match the fabric and details you listed.',
  AI_OR_MANIPULATED_IMAGE_SUSPECTED: 'Use real, lightly edited photos of the actual piece.',
  WRONG_CATEGORY_OR_METADATA_MISMATCH: 'Check the category, garment type and details so they describe this piece.',
  UNSAFE_OR_FALSE_CLAIM: 'Remove or correct claims that cannot be backed up.',
  INTELLECTUAL_PROPERTY_OR_BRAND_MISUSE: 'Remove other brands’ names, logos or designs you do not own.',
  PROHIBITED_CONTENT: 'Remove the content that breaks the community guidelines.',
  NOT_A_PRODUCT_OR_DESIGN_LISTING: 'Make sure this listing is a design or product you offer.',
  OTHER: 'Follow the reviewer’s note, then resubmit.',
};

export function reviewFocusFor(reasonCode?: string | null): ReviewFocus {
  const code = String(reasonCode ?? '').toUpperCase();
  if (MEDIA_REASONS.has(code)) return 'media';
  if (DETAILS_REASONS.has(code)) return 'details';
  return 'listing';
}

/**
 * The feedback to show for an item, or null. Only the NEWEST review cycle
 * counts: once the brand resubmits, that cycle is IN_REVIEW and the old notes
 * are no longer what stands between them and going live.
 */
export function feedbackFromHistory(items: readonly ContentReviewHistoryItem[]): ReviewFeedback | null {
  const latest = items[0];
  if (!latest) return null;
  if (latest.status !== 'CHANGES_REQUESTED' && latest.status !== 'REJECTED') return null;
  const code = String(latest.reasonCode ?? '').toUpperCase();
  return {
    status: latest.status,
    reasonLabel: latest.reasonLabel?.trim() || null,
    reasonNote: latest.reasonNote?.trim() || null,
    focus: reviewFocusFor(code),
    guidance: GUIDANCE[code] ?? GUIDANCE.OTHER,
    reviewedAt: latest.reviewedAt,
  };
}

/** Statuses for which the editor looks the review up at all. */
export function statusMayCarryFeedback(status?: string | null): boolean {
  const value = String(status ?? '').toUpperCase();
  return value === 'CHANGES_REQUESTED' || value === 'REJECTED' || value === 'FAILED';
}

/** The submit button's name for an item in this state. */
export function submitLabelFor(status?: string | null, fallback = 'Create'): string {
  return statusMayCarryFeedback(status) ? 'Resubmit for review' : fallback;
}

/**
 * The latest review feedback for a design or product the brand owns.
 *
 * Cached under the private `design` root (purged on sign-out) so returning to
 * the editor shows the notes at once; refetched in the background.
 */
export function useReviewFeedback(target: {
  designId?: string | null;
  productId?: string | null;
  status?: string | null;
}) {
  const id = target.designId ?? target.productId ?? null;
  const enabled = Boolean(id) && statusMayCarryFeedback(target.status);
  const query = useQuery({
    queryKey: ['design', 'reviewHistory', target.designId ? 'design' : 'product', id],
    queryFn: () =>
      contentIntegrityApi.getMyReviewHistory({
        designId: target.designId ?? null,
        productId: target.productId ?? null,
      }),
    enabled,
    staleTime: 30_000,
  });
  return enabled && query.data ? feedbackFromHistory(query.data) : null;
}
