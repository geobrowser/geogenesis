'use client';

import * as React from 'react';

import cx from 'classnames';

const RankingComposeScrollContext = React.createContext<Element | null>(null);

export function useRankingComposeScrollRoot() {
  return React.useContext(RankingComposeScrollContext);
}

type Props = {
  isMobile: boolean;
  globalRanking: React.ReactNode;
  myRanking: React.ReactNode;
};

/** Desktop: Global left, My right. Mobile: My top, divider, Global below. */
export function RankingComposeLayout({ isMobile, globalRanking, myRanking }: Props) {
  const isDesktop = !isMobile;
  const [mobileScrollRoot, setMobileScrollRoot] = React.useState<Element | null>(null);
  const mobileScrollRootRef = React.useCallback((node: HTMLDivElement | null) => {
    setMobileScrollRoot(node);
  }, []);

  return (
    <RankingComposeScrollContext.Provider value={isMobile ? mobileScrollRoot : null}>
      <div
        ref={isMobile ? mobileScrollRootRef : undefined}
        className={cx(
          'h-full min-h-0 flex-1',
          isMobile && 'pt-8',
          isDesktop ? 'grid grid-cols-2 items-stretch gap-6 overflow-hidden' : 'overflow-x-hidden overflow-y-auto'
        )}
      >
        <section className={cx('flex min-h-0 flex-col', isDesktop ? 'order-2 min-h-0 overflow-hidden' : 'shrink-0')}>
          {myRanking}
        </section>

        {isMobile ? <div className="my-8 h-px shrink-0 bg-grey-02" role="separator" aria-hidden /> : null}

        <section className={cx('flex min-h-0 flex-col overflow-hidden', isDesktop && 'order-1')}>
          {globalRanking}
        </section>
      </div>
    </RankingComposeScrollContext.Provider>
  );
}
