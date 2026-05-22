'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
}

const SPOTLIGHT_TRACK_FRAMES = 60;
const SPOTLIGHT_SETTLE_MS = 250;

export function isElementVisibleInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
}

/** backdrop stays pointer-events-none. */
export function onboardingTipA11yProps(labelledById: string) {
  return {
    role: 'status' as const,
    'aria-live': 'polite' as const,
    'aria-atomic': true,
    'aria-labelledby': labelledById,
  };
}

/** Dismiss the tip on Escape */
export function useOnboardingTipEscapeDismiss(open: boolean, dismiss: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
 
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, dismiss]);
}

const backdropMotionProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

function measureSpotlightRect(element: HTMLElement): SpotlightRect | null {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  const borderRadius = window.getComputedStyle(element).borderRadius;
  return {
    top: Math.round(box.top),
    left: Math.round(box.left),
    width: Math.round(box.width),
    height: Math.round(box.height),
    borderRadius,
  };
}

/** Kept in sync through layout changes and motion. */
export function useSpotlightRect(
  elementRef: React.RefObject<HTMLElement | null>,
  active: boolean
): SpotlightRect | null {
  const [rect, setRect] = React.useState<SpotlightRect | null>(null);

  React.useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let rafCount = 0;
    let resizeObserver: ResizeObserver | undefined = undefined;

    const measure = () => {
      if (cancelled) return;
      const el = elementRef.current;
      if (!el || !isElementVisibleInViewport(el)) {
        setRect(null);
        return;
      }
      const next = measureSpotlightRect(el);
      if (next) setRect(next);
      else setRect(null);
    };

    const trackAnimation = () => {
      measure();
      if (!cancelled && rafCount < SPOTLIGHT_TRACK_FRAMES) {
        rafCount += 1;
        rafId = requestAnimationFrame(trackAnimation);
      }
    };

    measure();
    trackAnimation();

    const el = elementRef.current;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(el);
    }

    const settleTimeout = window.setTimeout(measure, SPOTLIGHT_SETTLE_MS);
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
  }, [active, elementRef]);

  return rect;
}

type OnboardingSpotlightBackdropProps = {
  spotlightRect: SpotlightRect;
  zIndex: number;
  motionKey: string;
};

/** Dim the page except a rounded cutout */
export function OnboardingSpotlightBackdrop({
  spotlightRect,
  zIndex,
  motionKey,
}: OnboardingSpotlightBackdropProps) {
  const { top, left, width, height, borderRadius } = spotlightRect;

  return (
    <motion.div
      key={motionKey}
      aria-hidden
      className="pointer-events-none fixed bg-transparent"
      style={{
        zIndex,
        top,
        left,
        width,
        height,
        borderRadius,
        boxShadow: '0 0 0 9999px color-mix(in srgb, var(--color-text) 20%, transparent)',
      }}
      initial={backdropMotionProps.initial}
      animate={backdropMotionProps.animate}
      exit={backdropMotionProps.exit}
      transition={backdropMotionProps.transition}
    />
  );
}
