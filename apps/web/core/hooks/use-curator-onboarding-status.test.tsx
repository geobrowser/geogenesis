import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'space-1' as string | null,
  isFetched: true,
  memberSpaces: [] as Array<{ type: string }>,
  hasRsvp: false,
  /** Keyed by vote kind, so a test can answer curation and claim positions separately. */
  hasVoteOfKind: new Map<number, boolean>(),
  hasDebateParticipation: false,
  entitiesByType: new Map<string, boolean>(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isFetched: mocks.isFetched }),
}));

vi.mock('~/core/io/queries', () => ({
  getSpacesWhereMember: () => Effect.succeed(mocks.memberSpaces),
  getUserHasVoteOfKind: (_userId: string, voteKinds: readonly number[]) =>
    Effect.succeed(voteKinds.some(kind => mocks.hasVoteOfKind.get(kind) === true)),
  getUserHasDebateParticipation: () => Effect.succeed(mocks.hasDebateParticipation),
  getAllEntities: ({ typeId }: { typeId: string }) =>
    Effect.succeed({ entities: mocks.entitiesByType.get(typeId) ? [{ id: 'e1' }] : [] }),
}));

const { useCuratorOnboardingStatus } = await import('./use-curator-onboarding-status');
const { RANK_TYPE_ID } = await import('~/core/ranking-block-ids');
const { COMMENT_TYPE_ID } = await import('~/core/comment-ids');
const { VOTE_TYPE_ID } = await import('~/core/debates/ontology');
const { CURATOR_ONBOARDING_STEPS, VISIBLE_CURATOR_ONBOARDING_STEPS } =
  await import('~/core/explore/curator-onboarding-steps');

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.personalSpaceId = 'space-1';
  mocks.isFetched = true;
  mocks.memberSpaces = [];
  mocks.hasRsvp = false;
  mocks.hasVoteOfKind = new Map();
  mocks.hasDebateParticipation = false;
  mocks.entitiesByType = new Map();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ hasRsvp: mocks.hasRsvp }) }))
  );
});

afterEach(() => vi.unstubAllGlobals());

/** Every step the card shows, and nothing hidden — which has to be enough to reach 100%. */
function completeEveryVisibleStep() {
  mocks.memberSpaces = [{ type: 'DAO' }];
  // Kind 1 only: a claim position is visible, an entity upvote is not.
  mocks.hasVoteOfKind = new Map([[1, true]]);
  mocks.hasDebateParticipation = true;
  mocks.entitiesByType = new Map([
    [VOTE_TYPE_ID, true],
    [COMMENT_TYPE_ID, true],
  ]);
}

describe('useCuratorOnboardingStatus', () => {
  it('keeps the checklist visible while steps are still open', async () => {
    mocks.memberSpaces = [{ type: 'DAO' }];

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(result.current.allComplete).toBe(false);
    expect(result.current.isVisible).toBe(true);
  });

  // Reports done rather than hiding: the section folds itself down and keeps showing 100%.
  it('reports every step done, and stays visible', async () => {
    completeEveryVisibleStep();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.allComplete).toBe(true));
    expect(result.current.progressPercent).toBe(100);
    expect(result.current.isVisible).toBe(true);
  });

  // Completion reads all-false until the query settles, so nothing downstream may act on it yet.
  it('is not complete while the answer is still unknown', () => {
    completeEveryVisibleStep();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.allComplete).toBe(false);
  });

  it('stays hidden without a personal space, complete or not', async () => {
    mocks.personalSpaceId = null;
    completeEveryVisibleStep();

    const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

    await waitFor(() => expect(result.current.isVisible).toBe(false));
  });

  // GEO-2800. Hidden steps keep their tracking and lose their vote in the total.
  describe('hidden steps', () => {
    it('reaches 100% on the visible steps alone, with the hidden ones untouched', async () => {
      completeEveryVisibleStep();

      const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

      await waitFor(() => expect(result.current.progressPercent).toBe(100));
      expect(result.current.totalCount).toBe(VISIBLE_CURATOR_ONBOARDING_STEPS.length);
      // The point of the exercise: no hidden step was completed, and 100% arrived anyway.
      expect(result.current.completion['rsvp-community-call']).toBe(false);
      expect(result.current.completion['submit-ranking']).toBe(false);
      expect(result.current.completion['vote-entity']).toBe(false);
    });

    it('still records a hidden step someone has already finished', async () => {
      // Nothing is lost while they are hidden, so unhiding them later restores real progress
      // rather than asking people to redo what they did.
      completeEveryVisibleStep();
      mocks.hasRsvp = true;
      mocks.entitiesByType.set(RANK_TYPE_ID, true);
      mocks.hasVoteOfKind.set(0, true);

      const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

      await waitFor(() => expect(result.current.completion['rsvp-community-call']).toBe(true));
      expect(result.current.completion['submit-ranking']).toBe(true);
      expect(result.current.completion['vote-entity']).toBe(true);
      // And they still do not inflate the count past the steps on screen.
      expect(result.current.completedCount).toBe(VISIBLE_CURATOR_ONBOARDING_STEPS.length);
    });

    it('keeps hidden steps in the list so their tracking survives', () => {
      const hidden = ['rsvp-community-call', 'submit-ranking', 'vote-entity'];

      expect(CURATOR_ONBOARDING_STEPS.map(step => step.id)).toEqual(expect.arrayContaining(hidden));
      for (const id of hidden) {
        expect(VISIBLE_CURATOR_ONBOARDING_STEPS.map(step => step.id)).not.toContain(id);
      }
    });
  });

  // The two live in one `user_votes` table separated only by kind, and the query behind the voting
  // step used to pass no kind at all — so a claim answer ticked it. With a claim step beside it,
  // that would credit one action as two.
  describe('claim positions and entity votes are different actions', () => {
    it('does not tick the voting step for someone who only answered a claim', async () => {
      mocks.hasVoteOfKind = new Map([[1, true]]);

      const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

      await waitFor(() => expect(result.current.completion['claim-position']).toBe(true));
      expect(result.current.completion['vote-entity']).toBe(false);
    });

    it('does not tick the claim step for someone who only upvoted an entity', async () => {
      mocks.hasVoteOfKind = new Map([[0, true]]);

      const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

      await waitFor(() => expect(result.current.completion['vote-entity']).toBe(true));
      expect(result.current.completion['claim-position']).toBe(false);
    });

    it('counts a veracity answer as a position, the same as a stance one', async () => {
      // Verify/dispute is kind 2 and agree/disagree is kind 1; the ticket names both.
      mocks.hasVoteOfKind = new Map([[2, true]]);

      const { result } = renderHook(() => useCuratorOnboardingStatus(), { wrapper });

      await waitFor(() => expect(result.current.completion['claim-position']).toBe(true));
    });
  });
});
