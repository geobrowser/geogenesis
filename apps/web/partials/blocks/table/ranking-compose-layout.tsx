'use client';

import * as React from 'react';

import cx from 'classnames';

const RankingComposeScrollContext = React.createContext<React.RefObject<HTMLDivElement | null> | null>(null);

export function useRankingComposeScrollRootRef() {
  return React.useContext(RankingComposeScrollContext);
}

export function useRankingComposeScrollRoot() {
  return useRankingComposeScrollRootRef()?.current ?? null;
}

type Props = {
  isMobile: boolean;
  globalRanking: React.ReactNode;
  myRanking: React.ReactNode;
  mobilePageScrollRef?: React.RefObject<HTMLDivElement | null>;
};

/** Desktop: Global left, My right. Mobile: My top, divider, Global below. */
export function RankingComposeLayout({ isMobile, globalRanking, myRanking, mobilePageScrollRef }: Props) {
  const isDesktop = !isMobile;
  const usesExternalMobileScroll = isMobile && Boolean(mobilePageScrollRef);
  const internalMobileScrollRootRef = React.useRef<HTMLDivElement | null>(null);
  const mobileScrollRootRef = mobilePageScrollRef ?? internalMobileScrollRootRef;
  const setMobileScrollRootNode = React.useCallback((node: HTMLDivElement | null) => {
    internalMobileScrollRootRef.current = node;
  }, []);

  return (
    <RankingComposeScrollContext.Provider value={isMobile ? mobileScrollRootRef : null}>
      <div
        ref={usesExternalMobileScroll ? undefined : isMobile ? setMobileScrollRootNode : undefined}
        data-ranking-compose-mobile-scroll={isMobile && !usesExternalMobileScroll ? '' : undefined}
        className={cx(
          'h-full max-h-full min-h-0 flex-1',
          isMobile && !usesExternalMobileScroll && 'pt-8',
          isMobile && usesExternalMobileScroll && 'flex flex-col',
          isDesktop
            ? 'grid grid-cols-2 items-stretch gap-6 overflow-hidden'
            : !usesExternalMobileScroll && 'overflow-x-hidden overflow-y-auto'
        )}
      >
        <section className={cx('flex min-h-0 flex-col', isDesktop ? 'order-2 min-h-0 overflow-hidden' : 'shrink-0')}>
          {myRanking}
        </section>

        {isMobile ? <div className="my-8 h-px shrink-0 bg-grey-02" role="separator" aria-hidden /> : null}

        <section className={cx('flex min-h-0 flex-col', isDesktop ? 'order-1 overflow-hidden' : 'shrink-0')}>
          {globalRanking}
        </section>
      </div>
    </RankingComposeScrollContext.Provider>
  );
}
