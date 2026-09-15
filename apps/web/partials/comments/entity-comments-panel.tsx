'use client';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';

import { useComments } from '~/core/hooks/use-comments';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

import { commentsPanelHostElementAtom, slideUpOpenCountAtom } from '~/atoms';

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

  // A slide-up — the proposal review sheet, the edit review — sits at z-10000, so a panel at 150
  // opens *underneath* it and reads as not opening at all. Raised over one when there is one, which
  // is the same move the entity side panel makes, and registered below as a scroll shard so it can
  // actually be scrolled once it is up there.
  const slideUpOpenCount = useAtomValue(slideUpOpenCountAtom);
  const setPanelHostElement = useSetAtom(commentsPanelHostElementAtom);
  const panelHostRef = React.useCallback(
    (node: HTMLElement | null) => {
      setPanelHostElement(node);
    },
    [setPanelHostElement]
  );

  return (
    <aside
      ref={panelHostRef}
      data-entity-comments-panel
      className={cx(
        'flex w-[360px] shrink-0 flex-col border-l border-divider bg-white',
        'md:fixed md:inset-x-0 md:top-auto md:bottom-0 md:h-[85dvh] md:w-full md:rounded-t-[16px] md:border-t md:border-l-0',
        // `md:` is a max-width breakpoint here (styles.css is desktop-first), so the mobile layer has
        // to be raised too — a media-query rule of equal specificity beats the unprefixed one, which
        // would leave the bottom sheet at z-80 under the slide-up: the exact case being fixed.
        //
        // Scoped to the overlay, like the desktop layer below it. A docked panel is part of its own
        // page, and on mobile it is `md:fixed` — so raising it would float it over a sheet it has
        // nothing to do with. Written as one ternary so only one mobile z class is ever emitted:
        // two of equal specificity would be settled by stylesheet order, not by this list.
        presentation === 'overlay' && slideUpOpenCount > 0 ? Z_LAYER_CLASS.commentsPanelOverSlideUpMobile : 'md:z-[80]',
        // Above the page but below the entity side panel (z-200), which can be
        // opened on top of it from a comment author's name.
        presentation === 'overlay' && 'shadow-2xl fixed inset-y-0 right-0 md:inset-y-auto',
        presentation === 'overlay' && (slideUpOpenCount > 0 ? Z_LAYER_CLASS.commentsPanelOverSlideUp : 'z-[150]')
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
