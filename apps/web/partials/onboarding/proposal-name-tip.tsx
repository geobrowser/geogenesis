'use client';

import * as React from 'react';

import { PRODUCT_ONBOARDING_HINT_IDS } from '~/atoms/product-onboarding';

import { SpotlightTip } from './spotlight-tip';
import { useDismissibleHint } from './use-dismissible-hint';

export function useProposalNameTip({
  enabled,
  slideUpEnterSettled,
}: {
  enabled: boolean;
  slideUpEnterSettled: boolean;
}) {
  return useDismissibleHint(PRODUCT_ONBOARDING_HINT_IDS.proposalName, {
    gate: enabled,
    enterSettled: slideUpEnterSettled,
  });
}

type ProposalNameTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  slideUpEnterSettled: boolean;
};

export function ProposalNameTip({
  open,
  dismiss,
  anchorRef,
  slideUpEnterSettled,
}: ProposalNameTipProps) {
  return (
    <SpotlightTip
      open={open}
      onDismiss={dismiss}
      anchorRef={anchorRef}
      placement="below"
      width={180}
      tipId="proposal-name-tip"
      zLayer="review"
      layoutSettled={slideUpEnterSettled}
    >
      Describe your edits before publishing
    </SpotlightTip>
  );
}
