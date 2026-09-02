'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { COMMENT_TYPE_ID } from '~/core/comment-ids';
import { VOTE_TYPE_ID } from '~/core/debates/ontology';
import {
  type CuratorOnboardingStepId,
  VISIBLE_CURATOR_ONBOARDING_STEPS,
} from '~/core/explore/curator-onboarding-steps';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import {
  getAllEntities,
  getSpacesWhereMember,
  getUserHasDebateParticipation,
  getUserHasVoteOfKind,
} from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';

export type CuratorOnboardingCompletion = Record<CuratorOnboardingStepId, boolean>;

function emptyCompletion(): CuratorOnboardingCompletion {
  return {
    'join-space': false,
    'claim-position': false,
    'participate-debate': false,
    'debate-winner': false,
    'rsvp-community-call': false,
    'vote-entity': false,
    'submit-ranking': false,
    'comment-entity': false,
  };
}

/**
 * Curation is an entity upvote; stance and veracity are a position on a claim.
 *
 * Split because the checklist asks for them separately. They share one `user_votes` table, and the
 * query behind "Vote on an entity" used to pass no kind at all — so answering a claim silently
 * ticked the voting step too. With a claim step beside it that would credit one action as two.
 */
const ENTITY_VOTE_KINDS = [0] as const;
const CLAIM_POSITION_VOTE_KINDS = [1, 2] as const;

async function personalSpaceHasEntityType(
  personalSpaceId: string,
  typeId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const { entities } = await Effect.runPromise(getAllEntities({ spaceId: personalSpaceId, typeId, limit: 1 }, signal));
  return entities.length > 0;
}

/**
 * Whether the user has RSVP'd to a community call, read from curator-backend via
 * our server proxy (which derives the person from the wallet cookie). A sent
 * invite counts even while it's still `pending` — most users never accept the
 * .ics in their mail client, so requiring `accepted` would strand the step.
 */
async function fetchHasCallRsvp(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/community-call/rsvp-status', { signal });
    if (!res.ok) {
      return false;
    }
    const data: { hasRsvp: boolean } = await res.json();
    return data.hasRsvp;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return false;
  }
}

export function useCuratorOnboardingStatus() {
  const { personalSpaceId, isFetched: isPersonalSpaceFetched } = usePersonalSpaceId();

  const { data: completion = emptyCompletion(), isLoading } = useQuery({
    queryKey: ['curator-onboarding-status', personalSpaceId],
    enabled: Boolean(personalSpaceId),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<CuratorOnboardingCompletion> => {
      if (!personalSpaceId) return emptyCompletion();

      const [memberSpaces, hasRsvp, hasVote, hasClaimPosition, hasDebate, hasDebateWinnerVote, hasRanking, hasComment] =
        await Promise.all([
          Effect.runPromise(getSpacesWhereMember(personalSpaceId, signal)),
          fetchHasCallRsvp(signal),
          Effect.runPromise(getUserHasVoteOfKind(personalSpaceId, ENTITY_VOTE_KINDS, signal)),
          Effect.runPromise(getUserHasVoteOfKind(personalSpaceId, CLAIM_POSITION_VOTE_KINDS, signal)),
          Effect.runPromise(getUserHasDebateParticipation(personalSpaceId, signal)),
          // A debate winner vote mints a Vote entity in the voter's own space, and nothing else
          // creates that type — so its presence is the vote.
          personalSpaceHasEntityType(personalSpaceId, VOTE_TYPE_ID, signal),
          personalSpaceHasEntityType(personalSpaceId, RANK_TYPE_ID, signal),
          personalSpaceHasEntityType(personalSpaceId, COMMENT_TYPE_ID, signal),
        ]);

      return {
        'join-space': memberSpaces.some(space => space.type === 'DAO'),
        'claim-position': hasClaimPosition,
        'participate-debate': hasDebate,
        'debate-winner': hasDebateWinnerVote,
        'rsvp-community-call': hasRsvp,
        'vote-entity': hasVote,
        'submit-ranking': hasRanking,
        'comment-entity': hasComment,
      };
    },
  });

  // Visible steps only. A hidden step still has its completion tracked above, but counting one in
  // the total would put 100% out of reach with nothing on screen to explain the shortfall.
  const completedCount = VISIBLE_CURATOR_ONBOARDING_STEPS.filter(step => completion[step.id]).length;
  const totalCount = VISIBLE_CURATOR_ONBOARDING_STEPS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  // Drives the collapse in `CuratorOnboardingSection`: a finished checklist folds down to its
  // heading rather than staying open on a column of ticks.
  const allComplete = completedCount === totalCount;

  return {
    personalSpaceId,
    completion,
    completedCount,
    totalCount,
    progressPercent,
    allComplete,
    isLoading: Boolean(personalSpaceId) && isLoading,
    isVisible: Boolean(personalSpaceId) && isPersonalSpaceFetched,
  };
}
