import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_VOTES_CAP,
  LOCAL_VOTES_STORAGE_KEY,
  LOCAL_VOTE_TTL_MS,
  bindSaveToAccount,
  clearLocalVotes,
  isLocalVoteCurrent,
  readLocalVotes,
  recordSavePromptShown,
  removeLocalVote,
  resetSaveRequest,
  toggleLocalVote,
} from './local-votes';

const vote = (entityId: string, direction: 'positive' | 'negative' = 'positive') => ({
  entityId,
  spaceId: 'space-1',
  responseKind: 'stance' as const,
  direction,
  title: `Claim ${entityId}`,
});

beforeEach(() => clearLocalVotes());
afterEach(() => vi.useRealTimers());

describe('toggleLocalVote', () => {
  it('casts, switches and takes back a vote, like the pills do signed in', () => {
    expect(toggleLocalVote(vote('a'))).toEqual({ action: 'cast', count: 1 });
    expect(toggleLocalVote(vote('a', 'negative'))).toEqual({ action: 'switch', count: 1 });
    expect(readLocalVotes().votes[0].direction).toBe('negative');
    expect(toggleLocalVote(vote('a', 'negative'))).toEqual({ action: 'remove', count: 0 });
    expect(readLocalVotes().votes).toEqual([]);
  });

  it('keeps one vote per claim and space', () => {
    toggleLocalVote(vote('a'));
    toggleLocalVote({ ...vote('a'), spaceId: 'space-2' });
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  it(`drops the oldest past ${LOCAL_VOTES_CAP}`, () => {
    for (let i = 0; i <= LOCAL_VOTES_CAP; i++) toggleLocalVote(vote(`c${i}`));
    const { votes } = readLocalVotes();
    expect(votes).toHaveLength(LOCAL_VOTES_CAP);
    expect(votes[0].entityId).toBe('c1');
  });
});

it('forgets votes older than 30 days', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  toggleLocalVote(vote('old'));
  vi.setSystemTime(Date.now() + LOCAL_VOTE_TTL_MS + 1);
  toggleLocalVote(vote('new'));
  expect(readLocalVotes().votes.map(v => v.entityId)).toEqual(['new']);
});

it('removes the storage entry once nothing is left to hold', () => {
  toggleLocalVote(vote('a'));
  recordSavePromptShown();
  expect(window.localStorage.getItem(LOCAL_VOTES_STORAGE_KEY)).not.toBeNull();
  removeLocalVote({ entityId: 'a', spaceId: 'space-1', responseKind: 'stance' });
  expect(window.localStorage.getItem(LOCAL_VOTES_STORAGE_KEY)).toBeNull();
  expect(readLocalVotes().prompt.shownCount).toBe(0);
});

it('keeps an upvote and a side on the same entity apart', () => {
  toggleLocalVote(vote('a'));
  toggleLocalVote({ ...vote('a', 'negative'), responseKind: 'curation' });
  expect(readLocalVotes().votes.map(v => [v.responseKind, v.direction])).toEqual([
    ['stance', 'positive'],
    ['curation', 'negative'],
  ]);
});

it('reads votes stored before up/downvotes joined as sides on claims', () => {
  window.localStorage.setItem(
    LOCAL_VOTES_STORAGE_KEY,
    JSON.stringify({
      votes: [{ claimId: 'old', spaceId: 'space-1', direction: 'negative', title: 'Old', votedAt: Date.now() }],
      prompt: { shownCount: 1, dismissCount: 0 },
      save: null,
    })
  );
  expect(readLocalVotes().votes).toMatchObject([{ entityId: 'old', responseKind: 'stance', direction: 'negative' }]);
});

it('reads corrupt storage as empty', () => {
  window.localStorage.setItem(LOCAL_VOTES_STORAGE_KEY, '{not json');
  expect(readLocalVotes().votes).toEqual([]);
});

describe('a save bound to an account', () => {
  it('is bound, and a sign-out resets it', () => {
    toggleLocalVote(vote('a'));
    bindSaveToAccount('did:privy:me');
    expect(readLocalVotes().save).toEqual({ accountId: 'did:privy:me' });
    resetSaveRequest();
    expect(readLocalVotes().save).toBeNull();
  });

  it('drops the first build’s timestamp marker, which bound to no account', () => {
    window.localStorage.setItem(
      LOCAL_VOTES_STORAGE_KEY,
      JSON.stringify({
        votes: [
          {
            entityId: 'a',
            spaceId: 'space-1',
            responseKind: 'stance',
            direction: 'positive',
            title: 'A',
            votedAt: Date.now(),
          },
        ],
        prompt: { shownCount: 0, dismissCount: 0 },
        save: { requestedAt: Date.now(), confirmed: true },
      })
    );
    expect(readLocalVotes().save).toBeNull();
  });
});

it('says whether a vote is still the one held, after it was switched or re-cast', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  toggleLocalVote(vote('a'));
  const [cast] = readLocalVotes().votes;
  expect(isLocalVoteCurrent(cast)).toBe(true);

  toggleLocalVote(vote('a', 'negative'));
  expect(isLocalVoteCurrent(cast)).toBe(false);

  toggleLocalVote(vote('a', 'negative'));
  vi.setSystemTime(Date.now() + 1000);
  toggleLocalVote(vote('a'));
  // Same side as before, cast again later: a different vote.
  expect(isLocalVoteCurrent(cast)).toBe(false);
});
