'use client';

import * as React from 'react';

import { PRODUCT_ONBOARDING_HINT_IDS } from '~/atoms/product-onboarding';

import { SpotlightTip } from './spotlight-tip';
import { useDismissibleHint } from './use-dismissible-hint';

const SLIDE_UP_SETTLE_MS = 600;

export function useProposalNameTip({ enabled }: { enabled: boolean }) {
  return useDismissibleHint(PRODUCT_ONBOARDING_HINT_IDS.proposalName, {
    gate: enabled,
    settleMs: SLIDE_UP_SETTLE_MS,
  });
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
