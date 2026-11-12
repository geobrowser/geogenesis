'use client';

import * as React from 'react';

import cx from 'classnames';

const RankingComposeScrollContext = React.createContext<React.RefObject<HTMLDivElement | null> | null>(null);

export function useRankingComposeScrollRootRef() {
  return React.useContext(RankingComposeScrollContext);
}

export function useRankingComposeScrollRoot() {
  const scrollRootRef = useRankingComposeScrollRootRef();
  const [scrollRoot, setScrollRoot] = React.useState<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    setScrollRoot(scrollRootRef?.current ?? null);
  }, [scrollRootRef]);

  return scrollRoot;
}

type Props = {
  isMobile: boolean;
  globalRanking: React.ReactNode;
  myRanking: React.ReactNode;
  mobilePageScrollRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Phones only: show one column at a time behind two tabs instead of stacking them (Best debates,
   * GEO-3678: "Team ranking" / "Your ranking"). Left out, phones stack the columns as before.
   */
  mobileTabs?: RankingComposeMobileTabs;
};

export type RankingComposeMobileTab = 'global' | 'my';

export type RankingComposeMobileTabs = {
  globalLabel: string;
  myLabel: string;
  active: RankingComposeMobileTab;
  onChange: (tab: RankingComposeMobileTab) => void;
};

function MobileTabBar({ tabs }: { tabs: RankingComposeMobileTabs }) {
  const options: Array<{ id: RankingComposeMobileTab; label: string }> = [
    { id: 'global', label: tabs.globalLabel },
    { id: 'my', label: tabs.myLabel },
  ];
  return (
    // The team picker's segmented style (equal segments, centred labels), at a 44px phone tap height.
    <div role="tablist" aria-label="Rankings" className="mb-3 flex shrink-0 rounded-full bg-grey-01 p-0.5">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={tabs.active === option.id}
          onClick={() => tabs.onChange(option.id)}
          className={cx(
            'grid h-10 flex-1 place-items-center rounded-full text-center text-[15px] leading-[18px] font-medium transition-colors',
            tabs.active === option.id ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-grey-04'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Desktop: Global left, My right. Mobile: My top, divider, Global below. */
export function RankingComposeLayout({ isMobile, globalRanking, myRanking, mobilePageScrollRef, mobileTabs }: Props) {
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
        {isMobile && mobileTabs ? (
          <>
            <MobileTabBar tabs={mobileTabs} />
            <section className="flex min-h-0 shrink-0 flex-col">
              {mobileTabs.active === 'my' ? myRanking : globalRanking}
            </section>
          </>
        ) : (
          <>
            <section
              className={cx('flex min-h-0 flex-col', isDesktop ? 'order-2 min-h-0 overflow-hidden' : 'shrink-0')}
            >
              {myRanking}
            </section>

            {isMobile ? <div className="my-8 h-px shrink-0 bg-grey-02" role="separator" aria-hidden /> : null}

            <section className={cx('flex min-h-0 flex-col', isDesktop ? 'order-1 overflow-hidden' : 'shrink-0')}>
              {globalRanking}
            </section>
          </>
        )}
      </div>
    </RankingComposeScrollContext.Provider>
  );
}
