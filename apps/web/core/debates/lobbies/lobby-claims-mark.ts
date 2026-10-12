'use client';

import * as React from 'react';

import type { DebateLobbyHighlights } from '../api';

/** The room vote and highlights the Claims tab can be new about, as stable keys. */
export function claimsActivityKeys(state: Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> | undefined) {
  if (!state) return [];
  return [
    ...(state.room_vote ? [`vote:${state.room_vote.vote_id}`] : []),
    ...state.highlights.map(highlight => `highlight:${highlight.claim.id}`),
  ];
}

/**
 * The phone Claims tab's dot (GEO-3137): a room vote or highlight that arrived while the viewer was
 * on People. What is there on first load, or while Claims is open, counts as seen.
 */
export function useClaimsTabMark(
  state: Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> | undefined,
  viewingClaims: boolean
) {
  const keys = claimsActivityKeys(state);
  const current = keys.join('\n');
  const [seen, setSeen] = React.useState<string | null>(null);
  if (state !== undefined && (seen === null || viewingClaims) && seen !== current) setSeen(current);
  if (seen === null || viewingClaims) return false;
  const seenKeys = new Set(seen.split('\n'));
  return keys.some(key => !seenKeys.has(key));
}
