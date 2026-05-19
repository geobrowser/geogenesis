'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';

import { proposalNameTipDismissedAtom } from '~/atoms/product-onboarding';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';

const TIP_GAP_PX = 12;
const TIP_WIDTH_PX = 180;
const VIEWPORT_PADDING_PX = 16;
const SCROLLBAR_GUTTER_PX = 20;

const SLIDE_UP_SETTLE_MS = 600;

const TIP_Z_BACKDROP = 10050;
const TIP_Z = 10051;

export function useProposalNameTip({ enabled }: { enabled: boolean }) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const [dismissed, setDismissed] = useAtom(proposalNameTipDismissedAtom);
  const [open, setOpen] = React.useState(false);

  const shouldOffer = hydrated && enabled && !dismissed && !isOnboardingVisible;

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

  return { open: shouldOffer && open, dismiss };
}

type TipPosition = {
  top: number;
  left: number;
  arrowLeft: number;
};

function isAnchorVisibleInViewport(anchor: HTMLElement): boolean {
  const rect = anchor.getBoundingClientRect();
  return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
}

function computeTipPosition(anchor: HTMLElement): TipPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const maxLeft = viewportWidth - TIP_WIDTH_PX - VIEWPORT_PADDING_PX - SCROLLBAR_GUTTER_PX;

  const centerX = rect.left + rect.width / 2;

  let left = centerX - TIP_WIDTH_PX / 2;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, maxLeft));

  const arrowLeft = Math.max(12, Math.min(centerX - left, TIP_WIDTH_PX - 12));

  return {
    top: rect.bottom + TIP_GAP_PX,
    left,
    arrowLeft,
  };
}

type ProposalNameTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function ProposalNameTip({ open, dismiss, anchorRef }: ProposalNameTipProps) {
  const [position, setPosition] = React.useState<TipPosition | null>(null);

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !isAnchorVisibleInViewport(anchor)) return;
    setPosition(computeTipPosition(anchor));
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let retryCount = 0;
    const maxRetries = 90;

    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      if (cancelled) return;
      const anchor = anchorRef.current;
      if (!anchor) return;
      updatePosition();
      if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) updatePosition();
        });
        resizeObserver.observe(anchor);
      }
    };

    const retryUntilAnchored = () => {
      if (cancelled) return;
      measure();
      const anchor = anchorRef.current;
      const isReady = anchor && isAnchorVisibleInViewport(anchor);
      if (!isReady && retryCount < maxRetries) {
        retryCount += 1;
        rafId = requestAnimationFrame(retryUntilAnchored);
      }
    };

    measure();
    rafId = requestAnimationFrame(retryUntilAnchored);
    const settleTimeout = window.setTimeout(measure, SLIDE_UP_SETTLE_MS);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimeout);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, updatePosition, anchorRef]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <>
          <motion.div
            key="proposal-name-tip-backdrop"
            className="pointer-events-none fixed inset-0 bg-text/20"
            style={{ zIndex: TIP_Z_BACKDROP }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          />
          <motion.div
            key="proposal-name-tip"
            role="dialog"
            aria-labelledby="proposal-name-tip-title"
            className="pointer-events-auto fixed"
            style={{ zIndex: TIP_Z, top: position.top, left: position.left, width: TIP_WIDTH_PX }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
          >
            <motion.div className="relative overflow-visible rounded-lg border border-grey-02 bg-white p-2 shadow-lg">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-0.5 size-3 rotate-45 border-t border-l border-grey-02 bg-white"
                style={{ left: position.arrowLeft, transform: 'translateX(-50%)' }}
              />
              <div className="rounded-lg bg-grey-01 px-3 pt-3 pb-4">
                <p id="proposal-name-tip-title" className="text-center text-button font-medium text-text">
                  Describe your edits before publishing
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-3 mx-auto block rounded border border-grey-02 bg-white px-5 py-1.5 text-button font-medium text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
