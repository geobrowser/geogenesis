import type { DebateHistoryItem, ScheduledDebateRequest } from '../api';
import type { ScheduledContent } from './scheduled-debates-section';

/**
 * Test data for the Requests tab (GEO-3463), shared by its suites: the timeline's, the tab's, the
 * real-hooks render and history's own. Ids are the suites' usual `user-me` and `user-them`.
 */

/** Every read landed, with nothing in it. */
export const EMPTY_SCHEDULED: ScheduledContent = {
  answerable: [],
  upcoming: [],
  lobbies: [],
  people: [],
  requestsError: null,
  roomsError: null,
  lobbiesError: null,
  loading: false,
};

/**
 * A pending scheduled invite between the viewer and `user-them`: one they sent the viewer to answer
 * (`mustAnswer`), or one the viewer sent and accepted, waiting on them. Two days out unless
 * `startsInMinutes` says otherwise; the slot is half an hour.
 */
export function invite(
  id: string,
  mustAnswer: boolean,
  { startsInMinutes = 2 * 24 * 60, ...overrides }: Partial<ScheduledDebateRequest> & { startsInMinutes?: number } = {}
): ScheduledDebateRequest {
  const start = Date.now() + startsInMinutes * 60_000;
  const inviter = mustAnswer ? 'user-them' : 'user-me';
  return {
    request_id: id,
    status: 'pending',
    scheduled_start_at: new Date(start).toISOString(),
    scheduled_end_at: new Date(start + 30 * 60_000).toISOString(),
    invited_by_user_id: inviter,
    created_by_admin: false,
    proposed_by_user_id: inviter,
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: 'user-me', accepted: mustAnswer ? null : true },
      { user_id: 'user-them', accepted: mustAnswer ? true : null },
    ],
    viewer_must_answer: mustAnswer,
    ...overrides,
  };
}

/**
 * A settled history item from a day ago: an untargeted claim request of the viewer's that nobody
 * took, which geo-chat#299 sends naming nobody.
 */
export function historyItem(overrides: Partial<DebateHistoryItem> = {}): DebateHistoryItem {
  return {
    id: 'claim_request:1',
    kind: 'claim_request',
    occurred_at: new Date(Date.now() - 86_400_000).toISOString(),
    direction: 'outgoing',
    outcome: 'passed_by_everyone',
    other_user_ids: [],
    claim: {
      id: 'c1',
      space_id: 's1',
      claim_entity_id: 'e1',
      claim: 'Stablecoins should be regulated',
      description: null,
    },
    debate_id: null,
    lobby: null,
    scheduled_start_at: null,
    ...overrides,
  };
}
