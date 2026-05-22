'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { reviewEditsTipDismissedAtom } from '~/atoms/product-onboarding';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useDiff } from '~/core/state/diff-store';

import { SpotlightTip } from './spotlight-tip';

// Wait for the flow bar's entry slide-up (~150ms spring) to settle before
// showing the tip + cutout, so neither appears mid-animation.
const FLOWBAR_ENTRY_DELAY_MS = 250;

export function useReviewEditsTip({ flowBarVisible }: { flowBarVisible: boolean }) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const { isReviewOpen } = useDiff();
  const [dismissed, setDismissed] = useAtom(reviewEditsTipDismissedAtom);
  const [open, setOpen] = React.useState(false);

  const shouldOffer =
    hydrated && flowBarVisible && !dismissed && !isOnboardingVisible && !isReviewOpen;

  React.useEffect(() => {
    if (!shouldOffer) {
      setOpen(false);
      return;
    }
    // Wait for the flow bar's slide-up to finish before mounting the tip and
    // cutout — otherwise both appear at the flow bar's start-of-animation
    // position (near the bottom edge) and visibly drift up with it.
    const timeoutId = window.setTimeout(() => setOpen(true), FLOWBAR_ENTRY_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [shouldOffer]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    setOpen(false);
  }, [setDismissed]);

  return { open: shouldOffer && open, dismiss, isActive: shouldOffer };
}

type ReviewEditsTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  spotlightRef: React.RefObject<HTMLElement | null>;
};

export function ReviewEditsTip({ open, dismiss, anchorRef, spotlightRef }: ReviewEditsTipProps) {
  return (
    <SpotlightTip
      open={open}
      onDismiss={dismiss}
      anchorRef={anchorRef}
      spotlightRef={spotlightRef}
      placement="above"
      width={220}
      tipId="review-edits-tip"
      zLayer="navbar"
      shellPaddingClassName="p-1"
      innerPaddingClassName="pt-3 pb-4"
    >
      When you&apos;re ready, review & publish your edits
    </SpotlightTip>
  );
}
