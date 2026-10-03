'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';
import { validateEntityId } from '~/core/utils/utils';

import type { DebateExtractedClaimsResponse } from './server/extracted-claims';

/**
 * GEO-2870 phase 2. One claim from the debate that just finished, as the rematch picker's
 * "From this debate" source draws it.
 */
export type FromThisDebateClaim = {
  /**
   * The id a request is made against, canonical: geo-chat's graph match where it found one, and
   * otherwise the stable id it minted for the claim (D1), which the publisher creates the claim
   * under. Either way the same id the graph will carry once the debate is published.
   */
  id: string;
  text: string;
  turnIndex: number;
  /** Who said it, from the turn the claim was extracted from. */
  speakerName: string | null;
  /** That speaker's personal space, so a caller can fall back to the participant's own name. */
  speakerSpaceId: string | null;
  /** geo-chat matched it to a claim already published in the debate's space. */
  matched: boolean;
};

function trimmedId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (id.length === 0) return null;
  const canonical = normId(id);
  return validateEntityId(canonical) ? canonical : null;
}

/**
 * geo-chat's `GET /debates/{id}/claims` payload → the claims the picker can list, in the order
 * they were said.
 *
 * - A claim with neither a graph match nor a minted id is skipped. Those are payloads written
 *   before geo-chat minted ids (geo-chat#201); the publisher would mint a fresh id for them at
 *   publish time, so there is no id to request now that would still mean the same claim later.
 * - A claim geo-chat classified as not contestable is skipped: the publisher does not tag it as a
 *   debate claim, so it is not a motion anyone can take a side on. An absent classification (an
 *   older payload) is kept.
 * - Two claims resolving to one id — both matched to the same published claim — list once.
 */
export function fromThisDebateCandidates(
  payload: Partial<DebateExtractedClaimsResponse> | null | undefined
): FromThisDebateClaim[] {
  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  const turns = Array.isArray(payload?.turns) ? payload.turns : [];
  const turnsByIndex = new Map(turns.map(turn => [turn.turn_index, turn]));

  const seen = new Set<string>();
  const candidates: FromThisDebateClaim[] = [];
  claims
    .map((claim, order) => ({ claim, order }))
    .sort((a, b) => (a.claim.turn_index ?? 0) - (b.claim.turn_index ?? 0) || a.order - b.order)
    .forEach(({ claim }) => {
      if (claim.is_contestable === false) return;
      const text = typeof claim.text === 'string' ? claim.text.trim() : '';
      if (!text) return;
      const matchedId = trimmedId(claim.existing_entity_id);
      const id = matchedId ?? trimmedId(claim.entity_id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const turn = turnsByIndex.get(claim.turn_index);
      candidates.push({
        id,
        text,
        turnIndex: claim.turn_index,
        speakerName: turn?.speaker_name?.trim() || null,
        speakerSpaceId: turn?.attributed_space_id || null,
        matched: matchedId !== null,
      });
    });
  return candidates;
}

/**
 * D4: the list grows and never reorders.
 *
 * Claims already listed keep their place and take the newer payload's text and turn in place. New
 * claims are appended after them, in the order the payload gives. A claim the payload no longer
 * carries — the final pass dropped or merged it — goes, unless `keepIds` names it: a claim somebody
 * has a request open on stays where it is, as last seen.
 */
export function mergeFromThisDebate(
  previous: FromThisDebateClaim[],
  next: FromThisDebateClaim[],
  keepIds: ReadonlySet<string>
): FromThisDebateClaim[] {
  const nextById = new Map(next.map(claim => [claim.id, claim]));
  const merged: FromThisDebateClaim[] = [];
  const listed = new Set<string>();
  for (const claim of previous) {
    const updated = nextById.get(claim.id);
    if (updated) merged.push(updated);
    else if (keepIds.has(claim.id)) merged.push(claim);
    else continue;
    listed.add(claim.id);
  }
  for (const claim of next) {
    if (!listed.has(claim.id)) merged.push(claim);
  }
  return merged;
}

/**
 * {@link mergeFromThisDebate} held across refetches, for one session.
 *
 * `next` is null while there is no answer to merge — a refetch in flight keeps the last list rather
 * than blanking it. Keyed on `resetKey` because the picker is reused between rematches, and one
 * pair's debate says nothing about the next pair's.
 */
export function useFromThisDebateList(
  next: FromThisDebateClaim[] | null,
  keepIds: ReadonlySet<string>,
  resetKey: string
): FromThisDebateClaim[] {
  const listRef = React.useRef<FromThisDebateClaim[]>([]);
  const resetRef = React.useRef(resetKey);
  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    listRef.current = [];
  }

  return React.useMemo(() => {
    if (next === null) return listRef.current;
    const merged = mergeFromThisDebate(listRef.current, next, keepIds);
    listRef.current = merged;
    return merged;
    // `resetKey` is read through the ref above, and listed so a new session recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, keepIds, resetKey]);
}
