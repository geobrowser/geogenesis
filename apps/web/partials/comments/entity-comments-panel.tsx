'use client';

import * as React from 'react';

import cx from 'classnames';

import { useComments } from '~/core/hooks/use-comments';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { SIDE_PANEL_WIDTH_CLASS } from '~/partials/side-panel-layout';

/**
 * "Comments" side panel for any entity. It hosts the same CommentSection entity
 * pages use, so threads, replies, votes, editing and the debater winner-pick
 * chips behave identically wherever it's mounted.
 *
 * `docked` (the debates feed) lays it out as a flex sibling that takes its own
 * column; `overlay` (EntityCommentsPanelHost, for comment buttons anywhere else)
 * pins it to the right edge above the page. Mobile is a bottom sheet either way
 * (NB: breakpoints here are desktop-first, so md: targets mobile).
 */
export function EntityCommentsPanel({
  entityId,
  spaceId,
  onClose,
  presentation = 'docked',
}: {
  entityId: string;
  spaceId: string;
  onClose: () => void;
  presentation?: 'docked' | 'overlay';
}) {
  // Same arguments as the host's own count query, so posting here updates it.
  const { totalCount } = useComments({ entityId, spaceId });

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      // The entity side panel opens on top of this one (from a comment author's
      // name) and has its own Escape handler. Both listen on the window, so
      // without this one press would dismiss both layers at once — leave it to
      // the top layer and close on the next press.
      if (document.querySelector('[data-entity-side-panel]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside
      data-entity-comments-panel
      className={cx(
        'flex shrink-0 flex-col border-l border-divider bg-white',
        'md:fixed md:inset-x-0 md:top-auto md:bottom-0 md:z-[80] md:h-[85dvh] md:w-full md:rounded-t-[16px] md:border-t md:border-l-0',
        // Docked, it's one column in the debates feed's row, so it matches its
        // siblings there (JoinDebatePanel, DebateClaimsPanel) at 360px.
        presentation === 'docked' && 'w-[360px]',
        // As an overlay it's the same kind of right-edge panel as the entity side
        // panel and opens in the same places, so it shares that panel's width.
        // Above the page but below it at z-200, since that one can open on top of
        // this from a comment author's name.
        presentation === 'overlay' &&
          cx(SIDE_PANEL_WIDTH_CLASS, 'shadow-2xl fixed inset-y-0 right-0 z-[150] md:inset-y-auto')
      )}
    >
      <header className="flex items-center justify-between px-5 py-4">
        <Text as="h2" variant="cardEntityTitle" color="text">
          Comments · {totalCount}
        </Text>
        <button type="button" aria-label="Close" onClick={onClose} className="text-grey-04 hover:text-text">
          <Close />
        </button>
      </header>
      <div className="no-scrollbar flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-5 pb-6">
        <CommentSection entityId={entityId} spaceId={spaceId} variant="panel" />
      </div>
    </aside>
  );
}
