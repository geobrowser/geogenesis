import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionContext } from '~/core/action-context';
import { voteOutcomeProperties } from '~/core/responses/entity-response';

import { castLocalVote } from './cast-local-vote';
import { clearLocalVotes } from './local-votes';
import { closeSaveVotesPrompt } from './save-votes-prompt';

const recordAction = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics-operations', () => ({ recordAction }));

const attribution = {
  component: 'claim_position_control',
  target_type: 'claim',
  target_id: 'claim-1',
} as ActionContext;
const cast = (direction: 'positive' | 'negative', responseKind: 'stance' | 'curation' = 'stance') =>
  castLocalVote({ entityId: 'claim-1', spaceId: 'space-1', responseKind, direction, title: 'A claim', attribution });
const recorded = () => recordAction.mock.calls.map(([, , properties]) => properties as Record<string, unknown>);

beforeEach(() => {
  clearLocalVotes();
  closeSaveVotesPrompt();
  window.sessionStorage.clear();
  recordAction.mockReset();
});

// GEO-3243: device votes carried `vote_direction` alone, so anything splitting votes by
// `response_action` read them as blank, though the same votes saved later had a direction.
describe('a vote kept on the device', () => {
  it('records which way it went, in the same fields as a vote published from an account', () => {
    cast('positive');
    cast('negative');
    cast('negative');

    expect(recorded()).toEqual([
      expect.objectContaining({
        response_action: 'agree',
        vote_kind: 'up',
        mutation_kind: 'cast',
        vote_action: 'cast',
      }),
      expect.objectContaining({
        response_action: 'disagree',
        vote_kind: 'down',
        mutation_kind: 'switch',
        previous_vote_direction: 'up',
      }),
      expect.objectContaining({ vote_direction: 'none', vote_action: 'remove', previous_vote_direction: 'down' }),
    ]);
  });

  it('carries every field a published vote does, plus how many votes are waiting', () => {
    cast('positive', 'curation');
    const published = voteOutcomeProperties({
      responseKind: 'curation',
      direction: 'positive',
      previousResponse: null,
      entityId: 'claim-1',
      spaceId: 'space-1',
    });

    expect(recorded()[0]).toEqual({ ...published, response_action: 'upvote', local_vote_count: 1 });
  });
});
