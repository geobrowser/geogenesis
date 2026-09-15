'use client';

import * as React from 'react';

import cx from 'classnames';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { ExploreCommentsIcon } from '~/partials/explore/explore-comments-icon';

type ProposalCommentsValue = {
  proposalId: string;
  spaceId: string;
  /** Counted on the server beside the proposal, so the pill can say how many before it is opened. */
  count: number;
  isPanelOpen: boolean;
  togglePanel: () => void;
};

const ProposalCommentsContext = React.createContext<ProposalCommentsValue | null>(null);

/**
 * Comments on a proposal, in the review screen's own side panel (GEO-2907).
 *
 * The same arrangement the linked-bounties panel uses, and deliberately not the app-wide comments
 * overlay: this screen is a slide-up, and an overlay portalled to the body has to be lifted over
 * the sheet and exempted from its scroll lock to be usable at all. A panel that is part of the
 * screen's own layout has neither problem — it shares the sheet's stacking context, scrolls with
 * it, and sits beside the proposal rather than over it.
 *
 * Provider / button / panel are split the way the bounty trio is, because the button lives in the
 * header and the panel lives in the body, and the open state belongs to neither.
 */
export function ProposalCommentsProvider({
  proposalId,
  spaceId,
  count,
  children,
}: {
  proposalId: string;
  spaceId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [isPanelOpen, setIsPanelOpen] = React.useState(false);
  const togglePanel = React.useCallback(() => setIsPanelOpen(open => !open), []);

  const value = React.useMemo<ProposalCommentsValue>(
    () => ({ proposalId, spaceId, count, isPanelOpen, togglePanel }),
    [proposalId, spaceId, count, isPanelOpen, togglePanel]
  );

  return <ProposalCommentsContext.Provider value={value}>{children}</ProposalCommentsContext.Provider>;
}

/** The pill in the review header, styled as the bounties one is. */
export function ProposalCommentsHeadButton() {
  const ctx = React.useContext(ProposalCommentsContext);
  if (!ctx) return null;

  return (
    <button
      type="button"
      onClick={ctx.togglePanel}
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded border px-1.5 text-metadata leading-none text-text transition-colors',
        'border-grey-02 bg-white hover:border-text'
      )}
      title="Comments"
      aria-expanded={ctx.isPanelOpen}
    >
      <ExploreCommentsIcon />
      <span>{ctx.count}</span>
    </button>
  );
}

export function ProposalCommentsPanel() {
  const ctx = React.useContext(ProposalCommentsContext);
  if (!ctx || !ctx.isPanelOpen) return null;

  return (
    <aside
      className="sticky top-[52px] flex h-[calc(100vh-60px)] w-full max-w-[400px] shrink-0 flex-col self-start"
      aria-label="Comments"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
        <header className="flex shrink-0 items-center justify-between px-5 py-4">
          <Text as="h2" variant="cardEntityTitle" color="text">
            {ctx.count} {ctx.count === 1 ? 'comment' : 'comments'}
          </Text>
          <button
            type="button"
            aria-label="Close"
            onClick={ctx.togglePanel}
            className="text-grey-04 transition-colors hover:text-text"
          >
            <Close />
          </button>
        </header>
        {/* The section, not `EntityCommentsPanel` — that component is the panel *and* its shell, and
            its shell is a fixed-width column with its own left border. Dropped into this one it
            would fight the rounded card for width and draw a second border down the middle. The
            shell here is the bounties panel's, which is what this screen already uses. */}
        <div className="no-scrollbar flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-5 pb-6">
          <CommentSection entityId={ctx.proposalId} spaceId={ctx.spaceId} variant="panel" />
        </div>
      </div>
    </aside>
  );
}
