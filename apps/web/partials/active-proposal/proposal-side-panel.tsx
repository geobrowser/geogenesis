'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * The frame the review screen's side panels share — linked bounties, comments — so that "the same
 * panel" is one element rather than two copies of its classes.
 *
 * Part of the screen's own layout rather than an overlay portalled to the body, which is what makes
 * it the right shape here: the review screen is a slide-up, and a panel inside its layout shares its
 * stacking context and scrolls with it, so it needs neither a raised z-layer nor an exemption from
 * the sheet's scroll lock to be usable.
 *
 * `scroll` is which element scrolls — the whole card, or a region the panel manages itself, for a
 * panel with a header that should stay put while its list moves.
 */
export function ProposalSidePanelShell({
  label,
  scroll = 'card',
  children,
}: {
  label: string;
  scroll?: 'card' | 'inner';
  children: React.ReactNode;
}) {
  return (
    <aside
      className="sticky top-[52px] flex h-[calc(100vh-60px)] w-full max-w-[400px] shrink-0 flex-col self-start"
      aria-label={label}
    >
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col rounded-lg border border-grey-02 bg-white',
          scroll === 'card' ? 'overflow-y-auto' : 'overflow-hidden'
        )}
      >
        {children}
      </div>
    </aside>
  );
}
