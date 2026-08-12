'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';

import { EntityCommentsPanel } from './entity-comments-panel';

/**
 * App-level host for the comments panel, mounted once beside EntitySidePanel so
 * a comment button on any surface — explore cards, feed rows, data blocks — can
 * open comments without that surface having to own panel state or layout.
 *
 * Portalled to the body so an overflow-hidden or transformed ancestor (feed
 * cards sit inside plenty of both) can't clip or contain the fixed panel.
 */
export function EntityCommentsPanelHost() {
  const { commentsTarget, closeComments } = useEntityCommentsPanel();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Navigating has taken the reader somewhere they asked to go — a card title,
  // browser back, a keyboard link — and none of those routes produce the outside
  // pointerdown below, so the overlay would sit over the destination (and could
  // double up with the debates feed's own docked panel). Only on a change:
  // closing on mount would shut the panel the moment it opened.
  const pathname = usePathname();
  const lastPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    closeComments();
  }, [closeComments, pathname]);

  // Dismiss on a click outside the panel. Capture phase so it still fires when a
  // card's own handler stops propagation. Exempt: the panel itself; comment
  // buttons, which switch the panel to their entity instead of closing it; the
  // entity side panel, which opens on top from a comment author's name; and
  // anything Radix portals out of the panel (the sort/filter menus) or any
  // dialog, which live outside the panel in the DOM but not to the reader.
  React.useEffect(() => {
    if (!commentsTarget) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '[data-entity-comments-panel], [data-entity-comments-opener], [data-entity-side-panel], [data-radix-popper-content-wrapper], [data-radix-portal], [role="dialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }
      closeComments();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [commentsTarget, closeComments]);

  if (!mounted || !commentsTarget) return null;

  return createPortal(
    <EntityCommentsPanel
      entityId={commentsTarget.entityId}
      spaceId={commentsTarget.spaceId}
      onClose={closeComments}
      presentation="overlay"
    />,
    document.body
  );
}
