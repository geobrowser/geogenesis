import * as React from 'react';

type ReviewSpaceOptions = {
  spaceIds: string[];
  isReviewOpen: boolean;
  preferredSpaceVersion: number;
  preferredSpaceId: string;
  currentSpaceId?: string;
};

export function useReviewSpace({
  spaceIds,
  isReviewOpen,
  preferredSpaceVersion,
  preferredSpaceId,
  currentSpaceId,
}: ReviewSpaceOptions) {
  const [activeSpace, setActiveSpace] = React.useState('');
  const session = React.useRef<{ preferredAppliedVersion: number | null } | null>(null);

  React.useEffect(() => {
    if (!isReviewOpen) {
      session.current = null;
      return;
    }
    // Keep the published space's metadata during completion and import's clear/rebuild gap.
    if (spaceIds.length === 0) return;

    const isNewReview = session.current === null;
    if (isNewReview) session.current = { preferredAppliedVersion: null };

    // Explicit targets override the route once per request, independently of diff refreshes.
    // Wait for their operations if they have not reached the local store yet.
    if (session.current?.preferredAppliedVersion !== preferredSpaceVersion && spaceIds.includes(preferredSpaceId)) {
      session.current = { preferredAppliedVersion: preferredSpaceVersion };
      setActiveSpace(preferredSpaceId);
      return;
    }

    setActiveSpace(current => {
      if (isNewReview && currentSpaceId && spaceIds.includes(currentSpaceId)) return currentSpaceId;
      if (spaceIds.includes(current)) return current;
      return spaceIds[0];
    });
  }, [spaceIds, isReviewOpen, preferredSpaceVersion, preferredSpaceId, currentSpaceId]);

  return { activeSpace, setActiveSpace };
}
