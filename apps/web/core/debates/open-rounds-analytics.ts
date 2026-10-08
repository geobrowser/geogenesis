import * as React from 'react';

import { capture } from '~/core/analytics';

import type { Debate, OpenRoundPick, OpenRoundResolution, OpenRoundRevealedPick, ParticipantSlot } from './api';
import { isFinalOpenRound, isOpenRoundsDebate, openRebuttalRoundCount, openRoundIndexForTurn } from './open-rounds';

/**
 * Open rounds analytics (GEO-3182), for checking the bet behind blind picks: how often debates
 * extend, how often picks split or time out, and how often people change their pick. The events are
 * registered by geobrowser/analytics#100; geo-chat's `debate_rounds` / `debate_round_pick_events`
 * tables hold the same facts server side, for cross-checks and backfill.
 *
 * Both debaters send `debate_round_resolved` and `debate_completed_rounds`, so count either one per
 * debate with `participant_slot = 1`.
 */

/** How a round's picks came out, from the ticket's four buckets. */
export type OpenRoundPickSplit = 'both_extend' | 'both_end' | 'split' | 'timeout';

/** Why an Open rounds debate stopped. */
export type OpenRoundsEndedBy = 'split' | 'both_end' | 'timeout' | 'cap';

export type ResolvedOpenRound = {
  roundIndex: number;
  outcome: OpenRoundPick;
  resolution: OpenRoundResolution;
  picks: OpenRoundRevealedPick[];
};

/**
 * A round that resolved with a missing pick timed out, whatever the other pick was: the missing one
 * counted as End. Otherwise two different picks are a split.
 */
export function openRoundPickSplit(round: Pick<ResolvedOpenRound, 'resolution' | 'picks'>): OpenRoundPickSplit {
  const picks = round.picks.map(entry => entry.pick);
  if (round.resolution === 'deadline' || picks.length < 2 || picks.some(pick => pick === null)) return 'timeout';
  if (picks[0] !== picks[1]) return 'split';
  return picks[0] === 'extend' ? 'both_extend' : 'both_end';
}

/**
 * Every resolved round the payload knows of: `rounds[]`, plus the round the block itself describes
 * in its result window, which a payload written in the same transaction as the resolution may carry
 * before `rounds[]` does.
 */
export function resolvedOpenRounds(debate: Pick<Debate, 'open_rounds'>): ResolvedOpenRound[] {
  if (!isOpenRoundsDebate(debate)) return [];
  const openRounds = debate.open_rounds;
  const resolved = new Map<number, ResolvedOpenRound>();
  for (const round of openRounds.rounds ?? []) {
    resolved.set(round.round_index, {
      roundIndex: round.round_index,
      outcome: round.outcome,
      resolution: round.resolution,
      picks: round.picks ?? [],
    });
  }
  if (
    !resolved.has(openRounds.round_index) &&
    openRounds.outcome &&
    openRounds.resolution &&
    openRounds.revealed_picks?.length
  ) {
    resolved.set(openRounds.round_index, {
      roundIndex: openRounds.round_index,
      outcome: openRounds.outcome,
      resolution: openRounds.resolution,
      picks: openRounds.revealed_picks,
    });
  }
  return [...resolved.values()].sort((a, b) => a.roundIndex - b.roundIndex);
}

export function openRoundResolvedProperties(
  debateId: string,
  round: ResolvedOpenRound,
  participantSlot: ParticipantSlot
) {
  const myPick = round.picks.find(entry => entry.participant_slot === participantSlot)?.pick ?? null;
  const opponentPick = round.picks.find(entry => entry.participant_slot !== participantSlot)?.pick ?? null;
  const pickSplit = openRoundPickSplit(round);
  return {
    debate_id: debateId,
    round_index: round.roundIndex,
    outcome: round.outcome,
    resolution: round.resolution,
    participant_slot: participantSlot,
    my_pick: myPick,
    opponent_pick: opponentPick,
    split: pickSplit === 'split',
    pick_split: pickSplit,
  };
}

/**
 * Why a finished Open rounds debate stopped, or `null` when the payload cannot say. Every round but
 * the cap ends on a pick, so reaching the cap round means the cap ended it; otherwise the last
 * appended round resolved End, and its picks say how.
 */
export function openRoundsEndedBy(debate: Pick<Debate, 'open_rounds' | 'turn_durations_ms'>): OpenRoundsEndedBy | null {
  if (!isOpenRoundsDebate(debate)) return null;
  const lastRoundIndex = openRoundIndexForTurn(debate.turn_durations_ms.length - 1);
  if (isFinalOpenRound(debate.open_rounds, lastRoundIndex)) return 'cap';
  const lastRound = resolvedOpenRounds(debate).find(round => round.roundIndex === lastRoundIndex);
  if (!lastRound || lastRound.outcome !== 'end') return null;
  const pickSplit = openRoundPickSplit(lastRound);
  return pickSplit === 'both_extend' ? null : pickSplit;
}

export function openRoundsCompletedProperties(
  debate: Pick<Debate, 'id' | 'open_rounds' | 'turn_durations_ms'>,
  participantSlot: ParticipantSlot
) {
  const rebuttalRounds = openRebuttalRoundCount(debate);
  const endedBy = openRoundsEndedBy(debate);
  if (rebuttalRounds === null || endedBy === null || !debate.open_rounds) return null;
  return {
    debate_id: debate.id,
    rebuttal_rounds: rebuttalRounds,
    ended_by: endedBy,
    max_rebuttal_rounds: debate.open_rounds.max_rebuttal_rounds,
    participant_slot: participantSlot,
  };
}

export function openRoundPickSetProperties({
  debateId,
  roundIndex,
  pick,
  previousPick,
  msSinceCardOpened,
  decisionDeadlineAtMs,
  decisionWindowMs,
  nowMs,
  participantSlot,
}: {
  debateId: string;
  roundIndex: number;
  pick: OpenRoundPick;
  /** What the card showed as selected when the pick was tapped. */
  previousPick: OpenRoundPick | null;
  msSinceCardOpened: number;
  decisionDeadlineAtMs: number | null;
  decisionWindowMs: number;
  nowMs: number;
  participantSlot: ParticipantSlot;
}) {
  return {
    debate_id: debateId,
    round_index: roundIndex,
    pick,
    is_change: previousPick !== null,
    previous_pick: previousPick,
    // The card only opens in the decision window, and is the only place to pick.
    during_decision: true,
    // The round's second turn, which every round's pick follows.
    turn_index: roundIndex * 2 + 1,
    ms_before_deadline: decisionDeadlineAtMs === null ? null : Math.max(0, Math.round(decisionDeadlineAtMs - nowMs)),
    ms_since_card_opened: Math.max(0, Math.round(msSinceCardOpened)),
    decision_window_ms: decisionWindowMs,
    participant_slot: participantSlot,
  };
}

/**
 * Sends `debate_round_resolved` once per resolved round and `debate_completed_rounds` once per
 * debate, from a debater's live room. A room opened on a debate that already ended sends nothing,
 * and a reload keeps what this tab already sent in sessionStorage, so revisiting the room does not
 * count a round twice.
 */
export function useOpenRoundsOutcomeAnalytics(debate: Debate | null, participantSlot: ParticipantSlot | null) {
  const sentRef = React.useRef(new Set<string>());
  const sawLiveRef = React.useRef(false);

  React.useEffect(() => {
    if (!debate || participantSlot === null || !isOpenRoundsDebate(debate)) return;
    if (debate.status === 'in_progress' || debate.status === 'thanking') sawLiveRef.current = true;
    if (!sawLiveRef.current) return;

    const sendOnce = (key: string, send: () => void) => {
      const storageKey = `geo-open-rounds-analytics:${debate.id}:${participantSlot}:${key}`;
      if (sentRef.current.has(storageKey) || readSessionFlag(storageKey)) return;
      sentRef.current.add(storageKey);
      writeSessionFlag(storageKey);
      send();
    };

    for (const round of resolvedOpenRounds(debate)) {
      sendOnce(`round:${round.roundIndex}`, () =>
        captureSafely('debate_round_resolved', openRoundResolvedProperties(debate.id, round, participantSlot))
      );
    }

    if (debate.status === 'thanking' || debate.status === 'complete') {
      const properties = openRoundsCompletedProperties(debate, participantSlot);
      if (properties) sendOnce('completed', () => captureSafely('debate_completed_rounds', properties));
    }
  }, [debate, participantSlot]);
}

/** Analytics never gets in the way of the debate. */
export function captureSafely(...args: Parameters<typeof capture>) {
  try {
    capture(...args);
  } catch {
    // Dropped: the room carries on.
  }
}

function readSessionFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Without storage the in-memory set still dedupes within this page.
  }
}
