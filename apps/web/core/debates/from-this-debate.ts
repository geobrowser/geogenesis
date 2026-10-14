'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';
import { validateEntityId } from '~/core/utils/utils';

import { openRoundIndexForTurn } from './open-rounds';
import { roundLabel, roundParts } from './round-cues';
import type { DebateExtractedClaimsResponse } from './server/extracted-claims';

/**
 * GEO-2870 phase 2. One claim from the debate that just finished, as the rematch picker's
 * "From this debate" source draws it.
 */
export type FromThisDebateClaim = {
  /**
   * The id a request is made against, canonical: geo-chat's graph match where it found one, and
   * otherwise the stable id it minted for the claim (D1), which the publisher creates the claim
   * under. Either way the same id the graph carries once the claim is published, which since
   * GEO-2870 option A is shortly after extraction rather than with the debate.
   */
  id: string;
  text: string;
  turnIndex: number;
  /** Where in the debate it was said, in ms from the start; null on payloads without timings. */
  startMs: number | null;
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

function startMsOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * When a claim was said: by turn, then by where in the turn, with an untimed claim after the timed
 * ones in its turn. Ties are left to the caller, which breaks them by the order it was handed.
 */
function compareWhenSaid(
  a: Pick<FromThisDebateClaim, 'turnIndex' | 'startMs'>,
  b: Pick<FromThisDebateClaim, 'turnIndex' | 'startMs'>
): number {
  if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex;
  if (a.startMs === b.startMs) return 0;
  if (a.startMs === null) return 1;
  if (b.startMs === null) return -1;
  return a.startMs - b.startMs;
}

/**
 * geo-chat's `GET /debates/{id}/claims` payload → the claims the picker can list, in the order
 * they were said: by turn, then by where in the turn.
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
    .map((claim, order) => ({
      claim,
      order,
      said: { turnIndex: claim.turn_index ?? 0, startMs: startMsOf(claim.start_ms) },
    }))
    .sort((a, b) => compareWhenSaid(a.said, b.said) || a.order - b.order)
    .forEach(({ claim, said }) => {
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
        startMs: said.startMs,
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
 *
 * The tab no longer draws in this order: it groups by round and sorts by when each claim was said
 * ({@link groupFromThisDebateByRound}). What this still decides is which claims are listed.
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

/** One round of the debate on the "From this debate" tab, and the claims said in it. */
export type FromThisDebateRound<T> = { key: number; label: string; items: T[] };

/**
 * The tab's list as the debate ran: grouped by round, a round being both debaters' turns, and in
 * the order each claim was said within it.
 *
 * Sorted here rather than trusted from the list, which is append-only (D4) and so puts a claim the
 * final pass found late after everything already listed, whatever turn it came from.
 *
 * `turnCount` names the rounds the way the room did ("Round 2 · Rebuttal"). An Open rounds debate
 * runs as many rounds as the pair unlock, so the format's names do not apply there and its rounds
 * are numbered only.
 */
export function groupFromThisDebateByRound<T>(
  items: T[],
  claimOf: (item: T) => FromThisDebateClaim,
  { turnCount, numberedOnly }: { turnCount: number; numberedOnly: boolean }
): FromThisDebateRound<T>[] {
  const sorted = items
    .map((item, order) => ({ item, claim: claimOf(item), order }))
    .sort((a, b) => compareWhenSaid(a.claim, b.claim) || a.order - b.order);
  const rounds: FromThisDebateRound<T>[] = [];
  for (const { item, claim } of sorted) {
    const key = openRoundIndexForTurn(claim.turnIndex);
    let round = rounds[rounds.length - 1];
    if (!round || round.key !== key) {
      // Without a turn count there is no format to name the round from, only its number.
      const firstTurn = key * 2;
      const label =
        numberedOnly || turnCount <= 0 ? roundParts(firstTurn, turnCount).round : roundLabel(firstTurn, turnCount);
      round = { key, label, items: [] };
      rounds.push(round);
    }
    round.items.push(item);
  }
  return rounds;
}
