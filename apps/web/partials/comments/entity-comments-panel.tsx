'use client';

import * as React from 'react';

import { useComments } from '~/core/hooks/use-comments';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

/**
 * "Comments" side panel for any entity — opened from the debates feed's comment
 * button today, and intended for other feeds (explore) next. It hosts the same
 * CommentSection entity pages use, so threads, replies, votes, editing and the
 * debater winner-pick chips behave identically wherever it's mounted.
 *
 * Desktop docks it beside the host surface; mobile presents it as a bottom sheet
 * per the design (NB: breakpoints here are desktop-first, so md: targets mobile).
 */
export function EntityCommentsPanel({
  entityId,
  spaceId,
  onClose,
}: {
  entityId: string;
  spaceId: string;
  onClose: () => void;
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
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-divider bg-white md:fixed md:inset-x-0 md:top-auto md:bottom-0 md:z-[80] md:h-[85dvh] md:w-full md:rounded-t-[16px] md:border-t md:border-l-0">
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
