'use client';

import * as React from 'react';

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
