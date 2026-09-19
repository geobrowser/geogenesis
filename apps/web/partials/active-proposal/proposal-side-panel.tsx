'use client';

import * as React from 'react';

import cx from 'classnames';
import { atom, useAtom } from 'jotai';

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

type ProposalPanel = 'bounties' | 'comments';

/**
 * Which of the review screen's side panels is open, if any, and on which proposal.
 *
 * The screen has one panel slot. Held in one place because two independent booleans let both shells
 * render as siblings in the same row — each `shrink-0` and up to 400px — which squeezes the proposal
 * itself out of the space it was sharing. Opening either panel closes the other.
 *
 * The proposal is part of the state rather than something a cleanup has to remember to clear. Changing
 * `proposalId` on the governance route keeps `ActiveProposal` in the same tree position, so React
 * reconciles these providers with new props instead of unmounting them — no cleanup runs, and a slot
 * keyed on the panel alone would open the next proposal's panel because the last one was left open.
 * Keyed on both, a different proposal simply reads as closed.
 */
const activeProposalPanelAtom = atom<{ proposalId: string; panel: ProposalPanel } | null>(null);

export function useExclusiveProposalPanel(panel: ProposalPanel, proposalId: string) {
  const [active, setActive] = useAtom(activeProposalPanelAtom);

  const togglePanel = React.useCallback(
    () =>
      setActive(current =>
        current?.panel === panel && current.proposalId === proposalId ? null : { proposalId, panel }
      ),
    [panel, proposalId, setActive]
  );

  // Still cleared on unmount, so leaving the screen entirely does not leave the slot claimed.
  React.useEffect(
    () => () => setActive(current => (current?.panel === panel && current.proposalId === proposalId ? null : current)),
    [panel, proposalId, setActive]
  );

  return { isPanelOpen: active?.panel === panel && active.proposalId === proposalId, togglePanel };
}
