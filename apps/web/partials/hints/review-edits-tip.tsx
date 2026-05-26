'use client';

import * as React from 'react';

import { HINT_IDS } from '~/atoms/dismissed-hints';
import { useDiff } from '~/core/state/diff-store';

import { SpotlightTip } from './spotlight-tip';
import { useDismissibleHint } from './use-dismissible-hint';

export function useReviewEditsTip({
  flowBarVisible,
  flowBarEnterSettled,
}: {
  flowBarVisible: boolean;
  flowBarEnterSettled: boolean;
}) {
  const { isReviewOpen } = useDiff();
  const gate = flowBarVisible && !isReviewOpen;

  return useDismissibleHint(HINT_IDS.reviewEdits, {
    gate,
    enterSettled: flowBarEnterSettled,
  });
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
