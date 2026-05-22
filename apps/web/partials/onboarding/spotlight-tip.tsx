'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { AnimatePresence, motion } from 'framer-motion';

import { Z_LAYERS } from '~/core/z-layers';

import {
  isElementVisibleInViewport,
  OnboardingSpotlightBackdrop,
  onboardingTipA11yProps,
  useOnboardingTipEscapeDismiss,
  useSpotlightRect,
  type SpotlightRect,
} from './onboarding-spotlight';

const TIP_GAP_PX = 12;
const VIEWPORT_PADDING_PX = 16;
const SCROLLBAR_GUTTER_PX = 20;
const ARROW_INSET_PX = 12;

const TIP_MOTION = { type: 'spring' as const, duration: 0.2, bounce: 0 };

function spotlightTopForLayout(
  placement: SpotlightTipPlacement,
  spotlightRect: SpotlightRect | null,
  spotlightRef: React.RefObject<HTMLElement | null>
): number | undefined {
  if (placement !== 'above') return undefined;
  if (spotlightRect) return spotlightRect.top;
  const spotlightEl = spotlightRef.current;
  if (!spotlightEl || !isElementVisibleInViewport(spotlightEl)) return undefined;
  return Math.round(spotlightEl.getBoundingClientRect().top);
}

export type SpotlightTipPlacement = 'above' | 'below';
export type SpotlightTipZLayer = 'navbar' | 'review';

type TipLayout = {
  positionStyle: React.CSSProperties;
  arrowLeft: number;
  arrowUsesCenterTransform: boolean;
  motionOffsetY: number;
};

function zIndexesForLayer(zLayer: SpotlightTipZLayer) {
  return zLayer === 'review'
    ? { backdrop: Z_LAYERS.reviewOnboardingTipBackdrop, tip: Z_LAYERS.reviewOnboardingTip }
    : { backdrop: Z_LAYERS.onboardingTipBackdrop, tip: Z_LAYERS.onboardingTip };
}

function computeTipLayout(options: {
  placement: SpotlightTipPlacement;
  width: number;
  nudgeRightPx: number;
  arrowCentered: boolean;
  arrowTargetRect: DOMRect;
  spotlightTop?: number;
}): TipLayout {
  const { placement, width, nudgeRightPx, arrowCentered, arrowTargetRect, spotlightTop } = options;
  const viewportWidth = window.innerWidth;
  const maxLeft = viewportWidth - width - VIEWPORT_PADDING_PX - SCROLLBAR_GUTTER_PX;
  const targetCenterX = arrowTargetRect.left + arrowTargetRect.width / 2;

  let left = targetCenterX - width / 2 + nudgeRightPx;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, maxLeft));

  const arrowLeft = arrowCentered
    ? width / 2
    : Math.max(ARROW_INSET_PX, Math.min(targetCenterX - left, width - ARROW_INSET_PX));

  if (placement === 'below') {
    return {
      positionStyle: { top: arrowTargetRect.bottom + TIP_GAP_PX, left, width },
      arrowLeft,
      arrowUsesCenterTransform: true,
      motionOffsetY: -8,
    };
  }

  return {
    positionStyle: {
      bottom: window.innerHeight - (spotlightTop ?? arrowTargetRect.top) + TIP_GAP_PX,
      left,
      width,
    },
    arrowLeft,
    arrowUsesCenterTransform: false,
    motionOffsetY: 8,
  };
}

export type SpotlightTipProps = {
  open: boolean;
  onDismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  spotlightRef?: React.RefObject<HTMLElement | null>;
  arrowTargetRef?: React.RefObject<HTMLElement | null>;
  placement: SpotlightTipPlacement;
  width: number;
  tipId: string;
  zLayer: SpotlightTipZLayer;
  children: React.ReactNode;
  nudgeRightPx?: number;
  arrowCentered?: boolean;
  /**
   * Re-measure after this delay when the anchor mounts inside an animating panel
   * (e.g. proposal name inside SlideUp: 500ms delay + 500ms duration).
   */
  settleMs?: number;
  shellPaddingClassName?: 'p-1' | 'p-2';
  innerPaddingClassName?: string;
};

export function SpotlightTip({
  open,
  onDismiss,
  anchorRef,
  spotlightRef: spotlightRefProp,
  arrowTargetRef: arrowTargetRefProp,
  placement,
  width,
  tipId,
  zLayer,
  children,
  nudgeRightPx = 0,
  arrowCentered = false,
  settleMs,
  shellPaddingClassName = 'p-2',
  innerPaddingClassName = 'px-3 pt-3 pb-4',
}: SpotlightTipProps) {
  const spotlightRef = spotlightRefProp ?? anchorRef;
  const arrowTargetRef = arrowTargetRefProp ?? anchorRef;
  const titleId = `${tipId}-title`;
  const zIndexes = zIndexesForLayer(zLayer);

  const spotlightRect = useSpotlightRect(spotlightRef, open);
  const [layout, setLayout] = React.useState<TipLayout | null>(null);

  useOnboardingTipEscapeDismiss(open, onDismiss);

  const updateLayout = React.useCallback(() => {
    const arrowTarget = arrowTargetRef.current;

    if (!arrowTarget || !isElementVisibleInViewport(arrowTarget)) {
      setLayout(null);
      return;
    }

    const spotlightTop = spotlightTopForLayout(placement, spotlightRect, spotlightRef);
    if (placement === 'above' && spotlightTop === undefined) {
      setLayout(null);
      return;
    }

    setLayout(
      computeTipLayout({
        placement,
        width,
        nudgeRightPx,
        arrowCentered,
        arrowTargetRect: arrowTarget.getBoundingClientRect(),
        spotlightTop,
      })
    );
  }, [arrowCentered, arrowTargetRef, nudgeRightPx, placement, spotlightRect, spotlightRef, width]);

  React.useLayoutEffect(() => {
    if (!open) {
      setLayout(null);
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      if (cancelled) return;
      updateLayout();

      const observeTargets = new Set<HTMLElement>();
      const spotlightEl = spotlightRef.current;
      const arrowEl = arrowTargetRef.current;
      if (spotlightEl) observeTargets.add(spotlightEl);
      if (arrowEl) observeTargets.add(arrowEl);

      if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) updateLayout();
        });
        for (const el of observeTargets) resizeObserver.observe(el);
      }
    };

    measure();

    // SlideUp keeps the anchor at 0 height until its animation finishes — one delayed re-measure after settleMs is enough; no rAF poll needed alongside that.
    const settleTimeout = settleMs ? window.setTimeout(measure, settleMs) : undefined;

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelled = true;
      if (settleTimeout !== undefined) window.clearTimeout(settleTimeout);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, updateLayout, settleMs, placement, spotlightRect, spotlightRef, arrowTargetRef]);

  if (typeof document === 'undefined') {
    return null;
  }

  const isBelow = placement === 'below';
  const arrowClass = isBelow
    ? 'pointer-events-none absolute -top-0.5 size-3 rotate-45 border-t border-l border-grey-02 bg-white'
    : 'pointer-events-none absolute -bottom-1.5 size-3 rotate-45 border-b border-r border-grey-02 bg-white';

  return createPortal(
    <AnimatePresence>
      {open && layout && spotlightRect ? (
        <>
          <OnboardingSpotlightBackdrop
            spotlightRect={spotlightRect}
            zIndex={zIndexes.backdrop}
            motionKey={`${tipId}-backdrop`}
          />
          <motion.div
            key={tipId}
            {...onboardingTipA11yProps(titleId)}
            className="pointer-events-auto fixed"
            style={{ zIndex: zIndexes.tip, ...layout.positionStyle }}
            initial={{ opacity: 0, scale: 0.95, y: layout.motionOffsetY }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: layout.motionOffsetY }}
            transition={TIP_MOTION}
          >
            <motion.div
              className={`relative overflow-visible rounded-lg border border-grey-02 bg-white ${shellPaddingClassName} shadow-lg`}
            >
              <div
                aria-hidden
                className={arrowClass}
                style={
                  layout.arrowUsesCenterTransform
                    ? { left: layout.arrowLeft, transform: 'translateX(-50%)' }
                    : { left: layout.arrowLeft }
                }
              />
              <div className={`rounded-lg bg-grey-01 ${innerPaddingClassName}`}>
                <p id={titleId} className="text-center text-button font-medium text-text">
                  {children}
                </p>
                <button
                  type="button"
                  onClick={onDismiss}
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
