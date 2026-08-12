'use client';

import { useAtom } from 'jotai';

import { entityCommentsPanelAtom } from '~/atoms';

/**
 * Opens the global comments panel for an entity. Use from any comment button
 * that isn't on the entity's own full page — the panel keeps the reader where
 * they are instead of navigating them to the entity.
 */
export function useEntityCommentsPanel() {
  const [target, setTarget] = useAtom(entityCommentsPanelAtom);

  return {
    commentsTarget: target,
    openComments: (entityId: string, spaceId: string) => setTarget({ entityId, spaceId }),
    closeComments: () => setTarget(null),
  };
}
