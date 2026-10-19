'use client';

import * as React from 'react';

import cx from 'classnames';

import { useFeatureFlag } from '~/core/state/feature-flags';

import styles from './rematch-video-header.module.css';

export const RematchPickerHeaderContext = React.createContext<{ compact: boolean; expand: () => void } | null>(null);

/** Fold only the media; keep the tabs, filters, and media controls in the same sticky surface. */
export function RematchPickerStickyHeader({ children }: { children: React.ReactNode }) {
  const videoLayout = useFeatureFlag('debateVideo');
  const headerRef = React.useRef<HTMLDivElement>(null);
  const expandedHeight = React.useRef(0);
  const [compact, setCompact] = React.useState(false);
  const [reservedHeight, setReservedHeight] = React.useState(0);
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
    if (!header) return;
    const measure = () => {
      const height = header.getBoundingClientRect().height;
      if (!folded) expandedHeight.current = height;
      // Preserve the document height and the reader's place when the sticky surface shrinks.
      // Otherwise a fold can clamp scrollTop back to the expansion threshold on short lists.
      setReservedHeight(folded ? Math.max(0, expandedHeight.current - height) : 0);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    return () => observer?.disconnect();
  }, [folded]);

  const expand = () => {
    const scroller = headerRef.current?.closest('[data-rematch-scroll]');
    if (scroller) scroller.scrollTop = 0;
    headerRef.current?.focus({ preventScroll: true });
    setCompact(false);
  };

  return (
    <>
      <div
        ref={headerRef}
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
          {children}
        </RematchPickerHeaderContext.Provider>
      </div>
      <div aria-hidden style={{ height: reservedHeight }} />
    </>
  );
}
