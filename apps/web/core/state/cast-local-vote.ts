'use client';

import type { ActionContext } from '~/core/action-context';
import { observeOperation } from '~/core/analytics-operations';
import type { ResponseKind } from '~/core/responses/entity-response';

import { type LocalVoteChange, type LocalVoteDirection, readLocalVotes, toggleLocalVote } from './local-votes';
import {
  type SavePromptSurface,
  markPromptedThisSession,
  openSaveVotesPrompt,
  savePromptReasonAfterVote,
} from './save-votes-prompt';

/**
 * A signed-out press on any vote control (GEO-3214): kept on this device and drawn as the visitor's
 * at once, with no sign-in in the way. The save sheet asks for an account once they have a few.
 *
 * One function for the claim pills and the up/down arrows, so both count toward the same "Save N
 * votes" and report the same event.
 */
export function castLocalVote({
  entityId,
  spaceId,
  responseKind,
  direction,
  title,
  surface = 'feed',
  targetType,
  attribution,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  direction: LocalVoteDirection;
  title: string;
  surface?: SavePromptSurface;
  targetType: string;
  attribution: ActionContext;
}): LocalVoteChange {
  const change = toggleLocalVote({ entityId, spaceId, responseKind, direction, title });
  // The visit they voted in is not the "return visit" the sheet waits for.
  markPromptedThisSession();
  try {
    observeOperation('local_vote', targetType, entityId, undefined, attribution).succeeded({
      vote_direction: change.action === 'remove' ? 'none' : direction === 'positive' ? 'up' : 'down',
      vote_action: change.action,
      response_kind: responseKind,
      entity_id: entityId,
      space_id: spaceId,
      local_vote_count: change.count,
    });
  } catch {
    /* Never fail a vote over analytics. */
  }
  // Only casts count toward an ask: removing or switching a vote doesn't make anyone more invested.
  if (change.action === 'cast') {
    const reason = savePromptReasonAfterVote({
      count: change.count,
      surface,
      shownCount: readLocalVotes().prompt.shownCount,
    });
    if (reason) openSaveVotesPrompt(reason);
  }
  return change;
}
