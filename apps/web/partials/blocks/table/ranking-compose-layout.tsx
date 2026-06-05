'use client';

import * as React from 'react';

import cx from 'classnames';

type Props = {
  isMobile: boolean;
  globalRanking: React.ReactNode;
  myRanking: React.ReactNode;
};

/** Desktop: Global left, My right. Mobile: My top, divider, Global below. */
export function RankingComposeLayout({ isMobile, globalRanking, myRanking }: Props) {
  const isDesktop = !isMobile;

  return (
    <div
      className={cx(
        'min-h-0 flex-1',
        isMobile && 'pt-4',
        isDesktop ? 'grid grid-cols-2 items-stretch gap-6 overflow-hidden' : 'overflow-x-hidden overflow-y-auto'
      )}
    >
      <section className={cx('flex min-h-0 flex-col', isDesktop ? 'order-2' : 'shrink-0')}>{myRanking}</section>

      {isMobile ? <div className="my-6 h-px shrink-0 bg-grey-02" role="separator" aria-hidden /> : null}

      <section className={cx('flex flex-col', isDesktop && 'order-1 min-h-0')}>{globalRanking}</section>
    </div>
  );
}
