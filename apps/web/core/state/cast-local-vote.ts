'use client';

import type { ActionContext } from '~/core/action-context';
import { recordAction } from '~/core/analytics-operations';
import { type ResponseKind, voteOutcomeProperties } from '~/core/responses/entity-response';

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
  attribution,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  direction: LocalVoteDirection;
  title: string;
  surface?: SavePromptSurface;
  /** The pressed control's own action context, which also names the target. */
  attribution: ActionContext;
}): LocalVoteChange {
  const change = toggleLocalVote({ entityId, spaceId, responseKind, direction, title });
  // The visit they voted in is not the "return visit" the sheet waits for.
  markPromptedThisSession();
  try {
    recordAction('local_vote', attribution, {
      // The same fields a vote published from an account carries, so the two compare directly.
      ...voteOutcomeProperties({
        responseKind,
        direction: change.action === 'remove' ? 'clear' : direction,
        previousResponse: change.previous,
        entityId,
        spaceId,
      }),
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
