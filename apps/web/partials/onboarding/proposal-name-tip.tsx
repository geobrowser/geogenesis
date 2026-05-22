'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { proposalNameTipDismissedAtom } from '~/atoms/product-onboarding';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';

import { SpotlightTip } from './spotlight-tip';

const SLIDE_UP_SETTLE_MS = 600;

export function useProposalNameTip({ enabled }: { enabled: boolean }) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const [dismissed, setDismissed] = useAtom(proposalNameTipDismissedAtom);
  const [open, setOpen] = React.useState(false);

  const shouldOffer = hydrated && enabled && !dismissed && !isOnboardingVisible;

  React.useEffect(() => {
    if (!shouldOffer) {
      setOpen(false);
      return;
    }
    // Wait for the review SlideUp panel to finish sliding into view before
    // mounting the tip and cutout, so neither appears mid-animation (which
    // would briefly render them at the panel's start position near the
    // bottom of the screen).
    const timeoutId = window.setTimeout(() => setOpen(true), SLIDE_UP_SETTLE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [shouldOffer]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    setOpen(false);
  }, [setDismissed]);

  return { open: shouldOffer && open, dismiss };
}

type ProposalNameTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function ProposalNameTip({ open, dismiss, anchorRef }: ProposalNameTipProps) {
  return (
    <SpotlightTip
      open={open}
      onDismiss={dismiss}
      anchorRef={anchorRef}
      placement="below"
      width={180}
      tipId="proposal-name-tip"
      zLayer="review"
      settleMs={SLIDE_UP_SETTLE_MS}
    >
      Describe your edits before publishing
    </SpotlightTip>
  );
}
