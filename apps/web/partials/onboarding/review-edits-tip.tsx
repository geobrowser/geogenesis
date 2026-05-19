'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';

import { reviewEditsTipDismissedAtom } from '~/atoms/product-onboarding';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useDiff } from '~/core/state/diff-store';

const TIP_GAP_PX = 12;
const TIP_WIDTH_PX = 220;
const VIEWPORT_PADDING_PX = 16;

const SCROLLBAR_GUTTER_PX = 20;

const TIP_Z_BACKDROP = 10050;
const TIP_Z = 10051;

export function useReviewEditsTip({ flowBarVisible }: { flowBarVisible: boolean }) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const { isReviewOpen } = useDiff();
  const [dismissed, setDismissed] = useAtom(reviewEditsTipDismissedAtom);
  const [open, setOpen] = React.useState(false);

  const shouldOffer =
    hydrated && flowBarVisible && !dismissed && !isOnboardingVisible && !isReviewOpen;

  React.useEffect(() => {
    if (shouldOffer) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [shouldOffer]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    setOpen(false);
  }, [setDismissed]);

  return { open: shouldOffer && open, dismiss, isActive: shouldOffer };
}

type TipPosition = {
  bottom: number;
  left: number;
  arrowLeft: number;
};

function computeTipPosition(anchor: HTMLElement): TipPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const maxLeft = viewportWidth - TIP_WIDTH_PX - VIEWPORT_PADDING_PX - SCROLLBAR_GUTTER_PX;

  const centerX = rect.left + rect.width / 2;

  let left = centerX - TIP_WIDTH_PX / 2;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, maxLeft));

  const arrowLeft = Math.max(12, Math.min(centerX - left, TIP_WIDTH_PX - 12));

  return {
    bottom: window.innerHeight - rect.top + TIP_GAP_PX,
    left,
    arrowLeft,
  };
}

type ReviewEditsTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function ReviewEditsTip({ open, dismiss, anchorRef }: ReviewEditsTipProps) {
  const [position, setPosition] = React.useState<TipPosition | null>(null);

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPosition(computeTipPosition(anchor));
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <>
          <motion.div
            key="review-edits-tip-backdrop"
            className="pointer-events-none fixed inset-0 bg-text/20"
            style={{ zIndex: TIP_Z_BACKDROP }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          />
          <motion.div
            key="review-edits-tip"
            role="dialog"
            aria-labelledby="review-edits-tip-title"
            className="pointer-events-auto fixed"
            style={{ zIndex: TIP_Z, bottom: position.bottom, left: position.left, width: TIP_WIDTH_PX }}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
          >
            <motion.div className="relative overflow-visible rounded-lg border border-grey-02 bg-white p-1 shadow-lg">
              <div className="rounded-lg bg-grey-01 pt-3 pb-4">
                <p id="review-edits-tip-title" className="text-center text-button font-medium text-text">
                  When you&apos;re ready, review & publish your edits
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-3 mx-auto block rounded border border-grey-02 bg-white px-5 py-1.5 text-button font-medium text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
                >
                  OK
                </button>
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-2 size-3 rotate-45 border-b border-r border-grey-02 bg-white"
                style={{ left: position.arrowLeft}}
              />
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
