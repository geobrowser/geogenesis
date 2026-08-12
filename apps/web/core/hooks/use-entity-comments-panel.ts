'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { entityCommentsPanelAtom } from '~/atoms';

/**
 * Opens the global comments panel for an entity. Use from any comment button
 * that isn't on the entity's own full page — the panel keeps the reader where
 * they are instead of navigating them to the entity.
 */
export function useEntityCommentsPanel() {
  const [target, setTarget] = useAtom(entityCommentsPanelAtom);

  // Stable identities: the host keys a document-level listener off these.
  const openComments = React.useCallback(
    (entityId: string, spaceId: string) => setTarget({ entityId, spaceId }),
    [setTarget]
  );
  const closeComments = React.useCallback(() => setTarget(null), [setTarget]);

  return { commentsTarget: target, openComments, closeComments };
}
