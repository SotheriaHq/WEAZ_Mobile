import type { ReviewPromptDto, ReviewSatisfaction, ReviewTargetType } from '@/src/api/ReviewApi';

export const REVIEW_TEXT_MAX_LENGTH = 5000;

export const SATISFACTION_OPTIONS: Array<{
  value: ReviewSatisfaction;
  label: string;
  emoji: string;
  tone: 'muted' | 'danger' | 'warning' | 'secondary' | 'success' | 'primary';
}> = [
  { value: 'NONE', label: 'Neutral', emoji: '😐', tone: 'muted' },
  { value: 'ANGRY', label: 'Angry', emoji: '😠', tone: 'danger' },
  { value: 'SAD', label: 'Sad', emoji: '😢', tone: 'warning' },
  { value: 'OKAY', label: 'Okay', emoji: '🙂', tone: 'secondary' },
  { value: 'HAPPY', label: 'Happy', emoji: '😊', tone: 'success' },
  { value: 'EXCITED', label: 'Excited', emoji: '🤩', tone: 'primary' },
];

export const getSatisfactionOption = (value?: ReviewSatisfaction | null) =>
  SATISFACTION_OPTIONS.find((option) => option.value === value) ?? SATISFACTION_OPTIONS[0];

export const targetLabel = (targetType: ReviewTargetType) => {
  switch (targetType) {
    case 'PRODUCT':
      return 'product';
    case 'COLLECTION':
      return 'collection';
    case 'DESIGN':
      return 'design';
    case 'CUSTOM_ORDER':
      return 'custom order';
    case 'BRAND':
      return 'brand';
    default:
      return 'purchase';
  }
};

export const promptTitle = (prompt: ReviewPromptDto) => {
  const label = targetLabel(prompt.targetType);
  const suffix = prompt.orderId
    ? `order #${prompt.orderId.slice(0, 8).toUpperCase()}`
    : prompt.customOrderId
      ? `custom order #${prompt.customOrderId.slice(0, 8).toUpperCase()}`
      : 'completed purchase';
  return `Review this ${label} from ${suffix}`;
};

export const formatReviewDate = (value?: string | null) => {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatEditWindow = (value?: string | null) => {
  if (!value) return 'Edit window unavailable';
  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs <= 0) return 'Edit window expired';
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000)));
  return hours > 0 ? `${hours}h ${minutes}m left to edit` : `${minutes}m left to edit`;
};
