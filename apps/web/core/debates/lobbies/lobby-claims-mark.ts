'use client';

import * as React from 'react';

import { ID } from '~/core/id';

import type { DebateLobbyClaimList, DebateLobbyHighlights } from '../api';

/** A claim list's key: its tab's id in the claims area, and its entry in the Claims tab's mark. */
export function claimListKey(list: Pick<DebateLobbyClaimList, 'entity_id'>) {
  return `list:${ID.uuidToHex(list.entity_id)}` as const;
}

/** The room vote, highlights and claim lists the Claims tab can be new about, as stable keys. */
export function claimsActivityKeys(
  state: Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> | undefined,
  lists: Pick<DebateLobbyClaimList, 'entity_id'>[] = []
) {
  if (!state) return [];
  return [
    ...lists.map(claimListKey),
    ...(state.room_vote ? [`vote:${state.room_vote.vote_id}`] : []),
    // With its time, so the same claim highlighted again later counts as new.
    ...state.highlights.map(highlight => `highlight:${highlight.claim.id}:${highlight.highlighted_at}`),
  ];
}

/**
 * The phone Claims tab's dot (GEO-3137): a room vote, highlight or claim list (GEO-3274) that
 * arrived while the viewer was on People. What is there on first load, or while Claims is open,
 * counts as seen.
 */
export function useClaimsTabMark(
  state: Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> | undefined,
  viewingClaims: boolean,
  lists?: Pick<DebateLobbyClaimList, 'entity_id'>[]
) {
  const keys = claimsActivityKeys(state, lists);
  const current = keys.join('\n');
  const [seen, setSeen] = React.useState<string | null>(null);
  if (state !== undefined && (seen === null || viewingClaims) && seen !== current) setSeen(current);
  if (seen === null || viewingClaims) return false;
  const seenKeys = new Set(seen.split('\n'));
  return keys.some(key => !seenKeys.has(key));
}

/**
 * The claim list tabs to dot (GEO-3274): lists added while the viewer was here that they have not
 * opened. The lobby's lists on first render, and any tab once opened, count as seen.
 */
export function useNewClaimListTabs(listKeys: string[], openKey: string): ReadonlySet<string> {
  const [seen, setSeen] = React.useState<ReadonlySet<string> | null>(null);
  let next = seen ?? new Set(listKeys);
  if (listKeys.includes(openKey) && !next.has(openKey)) next = new Set([...next, openKey]);
  if (next !== seen) setSeen(next);
  return new Set(listKeys.filter(key => !next.has(key)));
}
