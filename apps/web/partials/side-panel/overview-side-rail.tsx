'use client';

import * as React from 'react';

import cx from 'classnames';

export const OVERVIEW_SIDE_RAIL_WIDTH_CLASS = 'w-[360px]';
export const OVERVIEW_SIDE_RAIL_TOP_PADDING_CLASS = 'pt-8';
export const OVERVIEW_SIDE_RAIL_DIVIDER_CLASS = 'my-8 border-t border-divider';
export const OVERVIEW_SIDE_RAIL_TITLE_CLASS = 'text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text';

type OverviewWithSideRailLayoutProps = {
  main: React.ReactNode;
  rail: React.ReactNode;
  /** Explore: vertical divider runs to the page top; content columns keep 32px top
   *  padding. Space: divider starts aligned with overview content below tabs. */
  variant?: 'space' | 'explore';
};

export function OverviewWithSideRailLayout({ main, rail, variant = 'space' }: OverviewWithSideRailLayoutProps) {
  const connectDividerToTop = variant === 'explore';
  const columnTopPadding = connectDividerToTop ? OVERVIEW_SIDE_RAIL_TOP_PADDING_CLASS : undefined;

  return (
    <div className={cx('flex gap-8', connectDividerToTop ? 'items-stretch' : 'items-start')}>
      <div className={cx('min-w-0 flex-1', columnTopPadding)}>{main}</div>
      <OverviewSideRailPageDivider />
      <div className={cx(columnTopPadding, 'shrink-0')}>{rail}</div>
    </div>
  );
}

export function OverviewSideRailPageDivider() {
  return <div aria-hidden className="w-px shrink-0 self-stretch bg-divider lg:hidden" />;
}

export function OverviewSideRail({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className={cx(
        'sticky top-11 flex h-[calc(100dvh-2.75rem)] shrink-0 flex-col self-start lg:hidden',
        OVERVIEW_SIDE_RAIL_WIDTH_CLASS
      )}
    >
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col pb-6">{children}</div>
      </div>
    </aside>
  );
}

export function OverviewSideRailDivider() {
  return <hr className={OVERVIEW_SIDE_RAIL_DIVIDER_CLASS} />;
}

export function OverviewSideRailSections({ sections }: { sections: { key: string; node: React.ReactNode }[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <React.Fragment key={section.key}>
          {index > 0 ? <OverviewSideRailDivider /> : null}
          {section.node}
        </React.Fragment>
      ))}
    </>
  );
}

type OverviewSideRailSectionProps = {
  title: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
  stickyTitle?: boolean;
  children: React.ReactNode;
};

export function OverviewSideRailSection({
  title,
  action,
  description,
  stickyTitle = true,
  children,
}: OverviewSideRailSectionProps) {
  return (
    <section className="flex flex-col">
      <div className={cx('flex flex-col gap-3 pb-8', stickyTitle && 'sticky top-0 z-20 bg-white pt-1')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={OVERVIEW_SIDE_RAIL_TITLE_CLASS}>{title}</h2>
          {action}
        </div>
        {description ? <p className="text-[16px] leading-[20px] text-grey-04">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
