'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { useComments } from '~/core/hooks/use-comments';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

/**
 * "Comments" side panel opened from the browse feed's comment button. Reuses the
 * entity page's CommentSection against the Debate entity, so threads, replies,
 * votes, editing, and the winner-pick chips behave exactly as they do there.
 *
 * Desktop docks it beside the feed like the Claims panel; mobile presents it as
 * a bottom sheet over the video per the design (NB: breakpoints in this file are
 * desktop-first, so md: targets mobile).
 */
export function DebateCommentsPanel({
  debate,
  spaceId,
  onClose,
}: {
  debate: Debate;
  spaceId: string;
  onClose: () => void;
}) {
  // Same query key as the feed item's count, so posting here updates the rail.
  const { totalCount } = useComments({ entityId: debate.id, spaceId });

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
        <CommentSection entityId={debate.id} spaceId={spaceId} variant="panel" />
      </div>
    </aside>
  );
}
