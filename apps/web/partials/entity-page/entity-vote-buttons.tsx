'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import { type VoteObjectType, useEntityVote } from '~/core/hooks/use-entity-vote';
import { getEntityVoteCount, getUserEntityVote } from '~/core/io/queries';

import { VoteArrow } from '~/design-system/icons/vote-arrow';

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

  const [optimisticVote, setOptimisticVote] = React.useState<OptimisticVote>(null);
  const [optimisticScore, setOptimisticScore] = React.useState<bigint | null>(null);

  const { data: voteCounts } = useQuery<{ upvotes: number; downvotes: number } | null>({
    queryKey: ['entity-vote-count', entityId, spaceId, objectType],
    queryFn: () => Effect.runPromise(getEntityVoteCount(entityId, spaceId, objectType)),
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

  function handleUpvote() {
    if (!isConnected) return;
    const base = optimisticScore !== null ? optimisticScore : netScore;
    if (activeVote === 0) {
      setOptimisticVote('none');
      setOptimisticScore(base - 1n);
      unvote(undefined, {
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
        onError: () => {
          setOptimisticVote(prevVote === 1 ? 1 : null);
          setOptimisticScore(null);
        },
      });
    }
  }

  function handleDownvote() {
    if (!isConnected) return;
    const base = optimisticScore !== null ? optimisticScore : netScore;
    if (activeVote === 1) {
      setOptimisticVote('none');
      setOptimisticScore(base + 1n);
      unvote(undefined, {
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
        onError: () => {
          setOptimisticVote(prevVote === 0 ? 0 : null);
          setOptimisticScore(null);
        },
      });
    }
  }

  const scoreLabel = formatScore(displayScore);

  const upvoteActive = activeVote === 0;
  const downvoteActive = activeVote === 1;

  return (
    <div className="flex items-center gap-1 text-metadataMedium text-text">
      <button
        onClick={handleDownvote}
        disabled={!isConnected}
        title={isConnected ? (downvoteActive ? 'Remove downvote' : 'Downvote') : 'Connect wallet to vote'}
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isConnected && 'cursor-default opacity-50'
        )}
      >
        <VoteArrow direction="down" filled={downvoteActive} color="grey-03" />
      </button>

      <span className="min-w-[2ch] text-center text-[16px]! tabular-nums">{scoreLabel}</span>

      <button
        onClick={handleUpvote}
        disabled={!isConnected}
        title={isConnected ? (upvoteActive ? 'Remove upvote' : 'Upvote') : 'Connect wallet to vote'}
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isConnected && 'cursor-default opacity-50'
        )}
      >
        <VoteArrow direction="up" filled={upvoteActive} color="grey-03" />
      </button>
    </div>
  );
}

function formatScore(score: bigint): string {
  const n = Number(score);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
