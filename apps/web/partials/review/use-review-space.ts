import * as React from 'react';

type ReviewSpaceOptions = {
  spaceIds: string[];
  isReviewOpen: boolean;
  reviewVersion: number;
  preferredSpaceId: string;
  currentSpaceId?: string;
};

export function useReviewSpace({
  spaceIds,
  isReviewOpen,
  reviewVersion,
  preferredSpaceId,
  currentSpaceId,
}: ReviewSpaceOptions) {
  const [activeSpace, setActiveSpace] = React.useState('');
  const session = React.useRef<{ version: number; preferredApplied: boolean } | null>(null);

  React.useEffect(() => {
    if (!isReviewOpen) {
      session.current = null;
      return;
    }
    // Keep the published space's metadata during completion and import's clear/rebuild gap.
    if (spaceIds.length === 0) return;

    const isNewReview = session.current?.version !== reviewVersion;
    if (isNewReview) session.current = { version: reviewVersion, preferredApplied: false };

    // Explicit targets (e.g. reopening a rejected proposal) override the route once per review.
    // Wait for their operations if they have not reached the local store yet.
    if (!session.current?.preferredApplied && spaceIds.includes(preferredSpaceId)) {
      session.current = { version: reviewVersion, preferredApplied: true };
      setActiveSpace(preferredSpaceId);
      return;
    }

    setActiveSpace(current => {
      if (isNewReview && currentSpaceId && spaceIds.includes(currentSpaceId)) return currentSpaceId;
      if (spaceIds.includes(current)) return current;
      return spaceIds[0];
    });
  }, [spaceIds, isReviewOpen, reviewVersion, preferredSpaceId, currentSpaceId]);

  return { activeSpace, setActiveSpace };
}
