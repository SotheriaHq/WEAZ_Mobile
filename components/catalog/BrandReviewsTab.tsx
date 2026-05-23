import React from 'react';

import ReviewsTab from '@/components/reviews/ReviewsTab';

interface BrandReviewsTabProps {
  brandId?: string;
  enabled?: boolean;
}

export function BrandReviewsTab({ brandId, enabled = true }: BrandReviewsTabProps) {
  return <ReviewsTab brandId={brandId ?? null} enabled={enabled} />;
}

export default BrandReviewsTab;
