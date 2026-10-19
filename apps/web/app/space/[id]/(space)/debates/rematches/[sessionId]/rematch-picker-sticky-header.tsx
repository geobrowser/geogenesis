'use client';

import * as React from 'react';

import cx from 'classnames';
import {
  LayoutGroup,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

import { useFeatureFlag } from '~/core/state/feature-flags';

import styles from './rematch-video-header.module.css';

const FOLD_TRANSITION = { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

export const RematchPickerHeaderContext = React.createContext<{ compact: boolean; expand: () => void } | null>(null);

/** Fold only the media; keep the tabs, filters, and media controls in the same sticky surface. */
export function RematchPickerStickyHeader({ children }: { children: React.ReactNode }) {
  const videoLayout = useFeatureFlag('debateVideo');
  const headerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const headerHeight = useMotionValue<number | string>('auto');
  const layoutGroupId = React.useId();
  const expandedHeight = useMotionValue(0);
  const [compact, setCompact] = React.useState(false);
  // Derive both surfaces from one animated value so the document height is constant each frame.
  const reservedHeight = useTransform(() => {
    const height = headerHeight.get();
    return typeof height === 'number' ? Math.max(0, expandedHeight.get() - height) : 0;
  });
  const folded = videoLayout && compact;

  React.useEffect(() => {
    const scroller = headerRef.current?.closest('[data-rematch-scroll]');
    if (!scroller || !videoLayout) return;
    // Separate thresholds keep a slow scroll near the top from repeatedly folding and unfolding.
    const onScroll = () => {
      setCompact(current => (scroller.scrollTop > 96 ? true : scroller.scrollTop < 16 ? false : current));
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [videoLayout]);

  React.useLayoutEffect(() => {
    const header = headerRef.current;
    const content = contentRef.current;
    if (!header || !content) return;
    let animation: ReturnType<typeof animate> | undefined;
    let targetHeight: number | undefined;
    const measure = () => {
      // Read the natural content, not the animated shell's intermediate height.
      const padding = getComputedStyle(header);
      const height =
        content.getBoundingClientRect().height +
        (parseFloat(padding.paddingTop) || 0) +
        (parseFloat(padding.paddingBottom) || 0);
      if (height === targetHeight) return;
      targetHeight = height;
      if (!folded) expandedHeight.set(height);
      animation?.stop();
      if (!videoLayout || reduceMotion || typeof headerHeight.get() !== 'number') {
        headerHeight.set(height);
      } else {
        animation = animate(headerHeight, height, FOLD_TRANSITION);
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(content);
    return () => {
      observer?.disconnect();
      animation?.stop();
    };
  }, [folded, videoLayout, reduceMotion, headerHeight, expandedHeight]);

  const expand = () => {
    const scroller = headerRef.current?.closest('[data-rematch-scroll]');
    if (scroller) scroller.scrollTop = 0;
    headerRef.current?.focus({ preventScroll: true });
    setCompact(false);
  };

  return (
    <MotionConfig
      reducedMotion="user"
      skipAnimations={!videoLayout || Boolean(reduceMotion)}
      transition={FOLD_TRANSITION}
    >
      <LayoutGroup id={layoutGroupId}>
        <motion.div
          ref={headerRef}
          layoutRoot
          layout="position"
          initial={false}
          style={{ height: headerHeight }}
          tabIndex={-1}
          role="group"
          aria-label="Participants and claim filters"
          data-testid="rematch-sticky-header"
          data-compact={folded}
          className={cx(
            'sticky top-0 z-20 -mx-5 -mt-8 bg-white px-5 pt-8 pb-3 mobile:-mx-4 mobile:-mt-4 mobile:px-4 mobile:pt-4',
            folded && [styles.compact, 'shadow-panel']
          )}
        >
          <RematchPickerHeaderContext.Provider value={{ compact: folded, expand }}>
            <div ref={contentRef} data-compact={folded}>
              {children}
            </div>
          </RematchPickerHeaderContext.Provider>
        </motion.div>
        <motion.div aria-hidden style={{ height: reservedHeight }} />
      </LayoutGroup>
    </MotionConfig>
  );
}
