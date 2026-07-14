'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { COMMENT_TYPE_ID } from '~/core/comment-ids';
import { CURATOR_ONBOARDING_STEPS, type CuratorOnboardingStepId } from '~/core/explore/curator-onboarding-steps';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getAllEntities, getSpacesWhereMember, getUserHasEntityVote } from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';

export type CuratorOnboardingCompletion = Record<CuratorOnboardingStepId, boolean>;

function emptyCompletion(): CuratorOnboardingCompletion {
  return {
    'join-space': false,
    'rsvp-community-call': false,
    'vote-entity': false,
    'submit-ranking': false,
    'comment-entity': false,
  };
}

async function personalSpaceHasEntityType(
  personalSpaceId: string,
  typeId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const { entities } = await Effect.runPromise(getAllEntities({ spaceId: personalSpaceId, typeId, limit: 1 }, signal));
  return entities.length > 0;
}

/**
 * Whether the user has accepted a community-call invite, read from the
 * Rendezvous RSVP service via our server proxy (which derives the person
 * from the wallet cookie). "Accepted" only — a pending invite is not an RSVP.
 */
async function fetchHasCallRsvp(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/community-call/rsvp-status', { signal });
    if (!res.ok) {
      return false;
    }
    const data: { hasAccepted: boolean } = await res.json();
    return data.hasAccepted;
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

      const [memberSpaces, hasRsvp, hasVote, hasRanking, hasComment] = await Promise.all([
        Effect.runPromise(getSpacesWhereMember(personalSpaceId, signal)),
        fetchHasCallRsvp(signal),
        Effect.runPromise(getUserHasEntityVote(personalSpaceId, signal)),
        personalSpaceHasEntityType(personalSpaceId, RANK_TYPE_ID, signal),
        personalSpaceHasEntityType(personalSpaceId, COMMENT_TYPE_ID, signal),
      ]);

      return {
        'join-space': memberSpaces.some(space => space.type === 'DAO'),
        'rsvp-community-call': hasRsvp,
        'vote-entity': hasVote,
        'submit-ranking': hasRanking,
        'comment-entity': hasComment,
      };
    },
  });

  const completedCount = CURATOR_ONBOARDING_STEPS.filter(step => completion[step.id]).length;
  const totalCount = CURATOR_ONBOARDING_STEPS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return {
    personalSpaceId,
    completion,
    completedCount,
    totalCount,
    progressPercent,
    isLoading: Boolean(personalSpaceId) && isLoading,
    isVisible: Boolean(personalSpaceId) && isPersonalSpaceFetched,
  };
}
