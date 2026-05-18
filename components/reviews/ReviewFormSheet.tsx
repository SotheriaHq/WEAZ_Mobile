import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ReviewDto, ReviewPromptDto, ReviewSatisfaction, SubmitReviewPayload, UpdateReviewPayload } from '@/src/api/ReviewApi';
import { tokens } from '@/src/styles/tokens';
import SatisfactionSelector from './SatisfactionSelector';
import StarRatingInput from './StarRatingInput';
import { promptTitle, REVIEW_TEXT_MAX_LENGTH, targetLabel } from './reviewDisplay';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  prompt?: ReviewPromptDto | null;
  review?: ReviewDto | null;
  onClose: () => void;
  onSubmit: (payload: SubmitReviewPayload | UpdateReviewPayload) => Promise<void>;
};

export default function ReviewFormSheet({ visible, mode, prompt, review, onClose, onSubmit }: Props) {
  const [rating, setRating] = useState(0);
  const [satisfaction, setSatisfaction] = useState<ReviewSatisfaction>('NONE');
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRating(review?.rating ?? 0);
    setSatisfaction(review?.satisfaction ?? 'NONE');
    setReviewText(review?.reviewText ?? '');
    setError(null);
    setSubmitting(false);
  }, [review, visible]);

  const title = useMemo(() => {
    if (mode === 'edit') return 'Edit review';
    if (prompt) return promptTitle(prompt);
    return 'Write a review';
  }, [mode, prompt]);

  const isValid = rating >= 1 && rating <= 5 && reviewText.length <= REVIEW_TEXT_MAX_LENGTH;

  const buildCreatePayload = (): SubmitReviewPayload => {
    if (!prompt) {
      return {
        targetType: review?.targetType ?? 'PRODUCT',
        orderId: review?.orderId,
        orderItemId: review?.orderItemId,
        customOrderId: review?.customOrderId,
        productId: review?.productId,
        collectionId: review?.collectionId,
        legacyCollectionId: review?.legacyCollectionId,
        designId: review?.designId,
        brandId: review?.brandId,
        rating,
        satisfaction,
        reviewText: reviewText.trim() || undefined,
      };
    }

    return {
      promptId: prompt.id,
      targetType: prompt.targetType,
      orderId: prompt.orderId,
      orderItemId: prompt.orderItemId,
      customOrderId: prompt.customOrderId,
      productId: prompt.productId,
      collectionId: prompt.collectionId,
      legacyCollectionId: prompt.legacyCollectionId,
      designId: prompt.designId,
      brandId: prompt.brandId,
      rating,
      satisfaction,
      reviewText: reviewText.trim() || undefined,
    };
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(mode === 'edit' ? { rating, satisfaction, reviewText: reviewText.trim() || undefined } : buildCreatePayload());
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={`Verified ${targetLabel(prompt?.targetType ?? review?.targetType ?? 'PRODUCT')} review`}
      onClose={submitting ? () => undefined : onClose}
      showCloseButton
    >
      <View style={styles.stack}>
        <View style={styles.group}>
          <AppText variant="bodyBold">Rating</AppText>
          <StarRatingInput value={rating} onChange={setRating} disabled={submitting} />
        </View>

        <View style={styles.group}>
          <AppText variant="bodyBold">How did it feel?</AppText>
          <SatisfactionSelector value={satisfaction} onChange={setSatisfaction} disabled={submitting} />
        </View>

        <Input
          label="Written review"
          placeholder="Optional notes about fit, quality, delivery, or service"
          value={reviewText}
          onChangeText={setReviewText}
          maxLength={REVIEW_TEXT_MAX_LENGTH}
          multiline
          editable={!submitting}
          helperText={`${reviewText.length}/${REVIEW_TEXT_MAX_LENGTH}`}
        />

        {error ? <AppText variant="captionBold" tone="danger">{error}</AppText> : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="secondary" onPress={onClose} disabled={submitting} />
          <Button
            title={mode === 'edit' ? 'Save review' : 'Submit review'}
            onPress={() => void handleSubmit()}
            disabled={!isValid || submitting}
            loading={submitting}
          />
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.lg,
  },
  group: {
    gap: tokens.spacing.sm,
  },
  actions: {
    gap: tokens.spacing.sm,
  },
});
