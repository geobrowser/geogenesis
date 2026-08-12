'use client';

import * as React from 'react';

import cx from 'classnames';

import { useComments } from '~/core/hooks/use-comments';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

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
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside
      data-entity-comments-panel
      className={cx(
        'flex w-[360px] shrink-0 flex-col border-l border-divider bg-white',
        'md:fixed md:inset-x-0 md:top-auto md:bottom-0 md:z-[80] md:h-[85dvh] md:w-full md:rounded-t-[16px] md:border-t md:border-l-0',
        // Above the page but below the entity side panel (z-200), which can be
        // opened on top of it from a comment author's name.
        presentation === 'overlay' && 'shadow-2xl fixed inset-y-0 right-0 z-[150] md:inset-y-auto'
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
