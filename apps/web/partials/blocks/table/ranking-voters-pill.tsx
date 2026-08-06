'use client';

import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import type { AggregatedRankingSubmitterRef } from '~/core/blocks/ranking/ranking-block-relations';
import { buildShortPersonalRankingSharePath } from '~/core/blocks/ranking/ranking-share';
import { useRankingVoters } from '~/core/blocks/ranking/use-ranking-voters';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

type Props = {
  refs: AggregatedRankingSubmitterRef[];
  count: number;
  children: React.ReactNode;
  onSelectVoter?: (rankEntityId: string, authorSpaceId: string, authorName?: string | null) => void;
};

const VOTER_AVATAR_SIZE = 32;

function VoterAvatar({ avatarUrl, fallbackSeed }: { avatarUrl: string | null; fallbackSeed: string }) {
  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
      {avatarUrl ? (
        <FallbackImage value={avatarUrl} sizes={`${VOTER_AVATAR_SIZE}px`} className="object-cover" />
      ) : (
        <Avatar size={VOTER_AVATAR_SIZE} value={fallbackSeed} />
      )}
    </div>
  );
}

export function RankingVotersPill({ refs, count, children, onSelectVoter }: Props) {
  const [open, setOpen] = React.useState(false);

  if (refs.length === 0) {
    return <>{children}</>;
  }

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger
        type="button"
        aria-label="See who ranked this"
        className="inline-flex shrink-0 items-center rounded transition-opacity duration-150 hover:opacity-80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-03"
      >
        {children}
      </Trigger>
      <Portal>
        <Content side="bottom" align="start" sideOffset={8} avoidCollisions className="z-100 origin-top-left">
          {open ? (
            <RankingVotersList
              refs={refs}
              count={count}
              onSelectVoter={onSelectVoter}
              onNavigate={() => setOpen(false)}
            />
          ) : null}
        </Content>
      </Portal>
    </Root>
  );
}

function RankingVotersList({
  refs,
  count,
  onSelectVoter,
  onNavigate,
}: {
  refs: AggregatedRankingSubmitterRef[];
  count: number;
  onSelectVoter?: (rankEntityId: string, authorSpaceId: string, authorName?: string | null) => void;
  onNavigate: () => void;
}) {
  const { voters, isLoading } = useRankingVoters(refs);
  const footerCount = voters.length || count;

  return (
    <div className="w-[300px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-y-auto">
        {isLoading && voters.length === 0 ? (
          <VoterRowSkeletons />
        ) : (
          voters.map(voter => {
            const label = voter.name ?? (voter.address ? formatShortAddress(voter.address) : 'Anonymous');
            const rowClassName = 'flex items-center gap-2 p-2 transition-colors duration-75 hover:bg-grey-01';
            const inner = (
              <>
                <VoterAvatar avatarUrl={voter.avatarUrl} fallbackSeed={voter.fallbackSeed} />
                <p className="min-w-0 truncate text-metadataMedium text-text">{label}</p>
              </>
            );

            if (onSelectVoter) {
              return (
                <button
                  key={voter.rankEntityId}
                  type="button"
                  className={cx(rowClassName, 'w-full text-left')}
                  onClick={() => {
                    onSelectVoter(voter.rankEntityId, voter.spaceId, voter.name);
                    onNavigate();
                  }}
                >
                  {inner}
                </button>
              );
            }

            return (
              <PrefetchLink
                key={voter.rankEntityId}
                href={buildShortPersonalRankingSharePath(voter.rankEntityId)}
                onClick={onNavigate}
                className={rowClassName}
              >
                {inner}
              </PrefetchLink>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-grey-04">
          {footerCount} {footerCount === 1 ? 'voter' : 'voters'}
        </p>
      </div>
    </div>
  );
}

function VoterRowSkeletons({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 p-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </>
  );
}
