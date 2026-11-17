'use client';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { speakerShortLabel } from '~/core/debates/debater-name';
import { useDebate } from '~/core/debates/hooks';
import { useParticipantBylines } from '~/core/debates/participant-bylines';
import { ID } from '~/core/id';
import { validateSpaceId } from '~/core/io/rest/validation';
import { responsePositionLabel } from '~/core/responses/entity-response';

import type { MomentsSpeaker } from './debate-moments-player';

/** A participant as the moments player labels a half: name, side, byline, face. */
export function momentsSpeaker(participant: DebateParticipant | null, byline: string | null): MomentsSpeaker | null {
  if (!participant) return null;
  return {
    name: speakerShortLabel(participant),
    side: responsePositionLabel(participant.position),
    byline,
    avatarUrl: participant.avatar_cid,
    avatarSeed: participant.profile_space_id,
  };
}

/**
 * The two debaters of a debate for the moments player's halves: slot 1 above, slot 2 below, the
 * way geo-chat stacks them in a moment clip and the feed player draws them. Null until the debate
 * has been read, and for good if it can't be: the halves are then just unlabelled.
 */
export function useMomentsSpeakers(debateId: string, enabled = true) {
  // geo-chat's own spelling, as the Explore card reads the same debate (hyphenated).
  const id = debateId.includes('-') ? debateId : ID.hexToUuid(debateId);
  const { data } = useDebate(id, enabled);
  const participants = data?.participants ?? null;
  const bylines = useParticipantBylines(participants ?? [], enabled && Boolean(participants));

  return React.useMemo(() => {
    if (!participants) return null;
    const bySlot = (slot: number) => participants.find(p => p.participant_slot === slot) ?? null;
    const bylineOf = (participant: DebateParticipant | null) => {
      const spaceId = participant ? validateSpaceId(participant.profile_space_id) : null;
      return spaceId ? (bylines.get(spaceId) ?? null) : null;
    };
    const top = bySlot(1);
    const bottom = bySlot(2);
    return { top: momentsSpeaker(top, bylineOf(top)), bottom: momentsSpeaker(bottom, bylineOf(bottom)) };
  }, [participants, bylines]);
}
