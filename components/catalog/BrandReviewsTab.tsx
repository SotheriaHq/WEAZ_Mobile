import React from 'react';

import ReviewsTab from '@/components/reviews/ReviewsTab';

interface BrandReviewsTabProps {
  brandId?: string;
}

export function BrandReviewsTab({ brandId }: BrandReviewsTabProps) {
  return <ReviewsTab brandId={brandId ?? null} />;
}

export default BrandReviewsTab;
