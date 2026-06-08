'use client';

import { useGeoLogin } from '@geogenesis/auth';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';
import { useSetAtom } from 'jotai';

import { downvoted, trackPrivyAuth, upvoted, voteCast } from '~/core/analytics';
import { type VoteObjectType, useEntityVote } from '~/core/hooks/use-entity-vote';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { type EntityVoter, getEntityVoteCount, getEntityVoters, getUserEntityVote } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { VoteArrow } from '~/design-system/icons/vote-arrow';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

type OptimisticVote = 0 | 1 | 'none' | null;

type EntityVoteButtonsProps = {
  entityId: string;
  spaceId: string;
  objectType?: VoteObjectType;
};

export function EntityVoteButtons({ entityId, spaceId, objectType = 0 }: EntityVoteButtonsProps) {
  const { upvote, downvote, unvote, isConnected, personalSpaceId } = useEntityVote({
    entityId,
    spaceId,
    objectType,
  });
  const { smartAccount } = useSmartAccount();
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
  });

  const [optimisticVote, setOptimisticVote] = React.useState<OptimisticVote>(null);
  const [optimisticScore, setOptimisticScore] = React.useState<bigint | null>(null);
  const [votersOpen, setVotersOpen] = React.useState(false);

  const { data: voteCounts } = useQuery<{ upvotes: number; downvotes: number } | null>({
    queryKey: ['entity-vote-count', entityId, objectType],
    queryFn: () => Effect.runPromise(getEntityVoteCount(entityId, objectType)),
    staleTime: 30_000,
  });

  const { data: userVoteType } = useQuery({
    queryKey: ['user-entity-vote', personalSpaceId, entityId, spaceId, objectType],
    queryFn: async () => {
      if (!personalSpaceId) return null;
      return Effect.runPromise(getUserEntityVote(personalSpaceId, entityId, spaceId, objectType));
    },
    enabled: !!personalSpaceId,
    staleTime: 30_000,
  });

  React.useEffect(
    function clearOptimisticScoreOnServerUpdate() {
      setOptimisticScore(null);
    },
    [voteCounts]
  );

  React.useEffect(
    function clearOptimisticVoteOnServerUpdate() {
      setOptimisticVote(null);
    },
    [userVoteType]
  );

  const serverVoteDirection = userVoteType === 0 ? 0 : userVoteType === 1 ? 1 : null;
  const activeVote =
    optimisticVote !== null ? (optimisticVote === 'none' ? null : optimisticVote) : serverVoteDirection;

  const upvotes = BigInt(voteCounts?.upvotes ?? 0);
  const downvotes = BigInt(voteCounts?.downvotes ?? 0);
  const netScore = upvotes - downvotes;
  const displayScore = optimisticScore !== null ? optimisticScore : netScore;

  function openPrivySignIn() {
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    login();
  }

  function handleUpvote() {
    if (!smartAccount) {
      openPrivySignIn();
      return;
    }
    if (!isConnected) return;
    const base = optimisticScore !== null ? optimisticScore : netScore;
    if (activeVote === 0) {
      setOptimisticVote('none');
      setOptimisticScore(base - 1n);
      unvote(undefined, {
        onSuccess: () => {
          voteCast('none', voteProperties('remove', 'up'));
        },
        onError: () => {
          setOptimisticVote(0);
          setOptimisticScore(null);
        },
      });
    } else {
      const delta = activeVote === 1 ? 2n : 1n;
      const prevVote = activeVote;
      setOptimisticVote(0);
      setOptimisticScore(base + delta);
      upvote(undefined, {
        onSuccess: () => {
          upvoted(voteProperties(prevVote === 1 ? 'switch' : 'cast', prevVote === 1 ? 'down' : undefined));
        },
        onError: () => {
          setOptimisticVote(prevVote === 1 ? 1 : null);
          setOptimisticScore(null);
        },
      });
    }
  }

  function handleDownvote() {
    if (!smartAccount) {
      openPrivySignIn();
      return;
    }
    if (!isConnected) return;
    const base = optimisticScore !== null ? optimisticScore : netScore;
    if (activeVote === 1) {
      setOptimisticVote('none');
      setOptimisticScore(base + 1n);
      unvote(undefined, {
        onSuccess: () => {
          voteCast('none', voteProperties('remove', 'down'));
        },
        onError: () => {
          setOptimisticVote(1);
          setOptimisticScore(null);
        },
      });
    } else {
      const delta = activeVote === 0 ? 2n : 1n;
      const prevVote = activeVote;
      setOptimisticVote(1);
      setOptimisticScore(base - delta);
      downvote(undefined, {
        onSuccess: () => {
          downvoted(voteProperties(prevVote === 0 ? 'switch' : 'cast', prevVote === 0 ? 'up' : undefined));
        },
        onError: () => {
          setOptimisticVote(prevVote === 0 ? 0 : null);
          setOptimisticScore(null);
        },
      });
    }
  }

  function voteProperties(action: 'cast' | 'switch' | 'remove', previousDirection?: 'up' | 'down') {
    return {
      vote_action: action,
      previous_vote_direction: previousDirection,
      entity_id: entityId,
      space_id: spaceId,
      object_type: objectType,
    };
  }

  const scoreLabel = formatScore(displayScore);

  const upvoteActive = activeVote === 0;
  const downvoteActive = activeVote === 1;

  const totalVoters = (voteCounts?.upvotes ?? 0) + (voteCounts?.downvotes ?? 0);

  return (
    <div className="flex items-center gap-1 text-metadataMedium text-text">
      <button
        onClick={handleUpvote}
        disabled={!!smartAccount && !isConnected}
        title={
          !smartAccount
            ? 'Sign in to vote'
            : isConnected
              ? upvoteActive
                ? 'Remove upvote'
                : 'Upvote'
              : 'Connect wallet to vote'
        }
        className={cx(
          'group/vote flex h-5 w-5 translate-y-px items-center justify-center rounded transition-colors',
          !!smartAccount && !isConnected && 'cursor-default opacity-50'
        )}
      >
        <VoteArrow direction="up" filled={upvoteActive} color="grey-03" />
      </button>
      <Popover.Root open={votersOpen} onOpenChange={setVotersOpen}>
        <Popover.Trigger asChild>
          <button
            className="min-w-[2ch] cursor-pointer text-center text-[16px]! tabular-nums hover:text-grey-04"
            title={totalVoters > 0 ? 'View voters' : undefined}
            disabled={totalVoters === 0}
          >
            {scoreLabel}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            side="bottom"
            sideOffset={8}
            className="z-100 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          >
            <VotersPopoverContent entityId={entityId} spaceId={spaceId} objectType={objectType} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button
        onClick={handleDownvote}
        disabled={!!smartAccount && !isConnected}
        title={
          !smartAccount
            ? 'Sign in to vote'
            : isConnected
              ? downvoteActive
                ? 'Remove downvote'
                : 'Downvote'
              : 'Connect wallet to vote'
        }
        className={cx(
          'group/vote flex h-5 w-5 translate-y-px items-center justify-center rounded transition-colors',
          !!smartAccount && !isConnected && 'cursor-default opacity-50'
        )}
      >
        <VoteArrow direction="down" filled={downvoteActive} color="grey-03" />
      </button>
    </div>
  );
}

type VoterWithProfile = EntityVoter & { profile: Profile };

function VotersPopoverContent({
  entityId,
  spaceId,
  objectType,
}: {
  entityId: string;
  spaceId: string;
  objectType: 0 | 1;
}) {
  const { data: votersWithProfiles, isLoading } = useQuery({
    queryKey: ['entity-voters', entityId, spaceId, objectType],
    queryFn: async () => {
      const voters = await Effect.runPromise(getEntityVoters(entityId, spaceId, objectType));
      if (voters.length === 0) return [];
      const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(voters.map(v => v.userId)));
      return voters.map((voter, i): VoterWithProfile => ({ ...voter, profile: profiles[i]! }));
    },
    staleTime: 30_000,
  });

  const upvoters = votersWithProfiles?.filter(v => v.voteType === 0) ?? [];
  const downvoters = votersWithProfiles?.filter(v => v.voteType === 1) ?? [];

  if (isLoading) {
    return <div className="px-3 py-4 text-center text-metadataMedium text-grey-04">Loading voters...</div>;
  }

  if (!votersWithProfiles || votersWithProfiles.length === 0) {
    return <div className="px-3 py-4 text-center text-metadataMedium text-grey-04">No votes yet</div>;
  }

  return (
    <div className="max-h-[356px] overflow-y-auto">
      {upvoters.length > 0 && <VoterSection label="Upvotes" voters={upvoters} />}
      {downvoters.length > 0 && <VoterSection label="Downvotes" voters={downvoters} />}
    </div>
  );
}

function VoterSection({ label, voters }: { label: string; voters: VoterWithProfile[] }) {
  return (
    <div>
      <div className="px-3 pt-2.5 pb-1.5 text-footnoteMedium text-grey-04">{label}</div>
      {voters.map(v => (
        <VoterRow key={v.userId} profile={v.profile} />
      ))}
    </div>
  );
}

function VoterRow({ profile }: { profile: Profile }) {
  const content = (
    <div className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-grey-01">
      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={profile.avatarUrl} value={profile.address} />
      </div>
      <span className="truncate text-metadataMedium text-text">{profile.name ?? truncateAddress(profile.address)}</span>
    </div>
  );

  if (profile.profileLink) {
    return <Link href={profile.profileLink}>{content}</Link>;
  }

  return content;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatScore(score: bigint): string {
  const n = Number(score);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
