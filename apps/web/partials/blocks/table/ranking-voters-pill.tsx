'use client';

import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import type { AggregatedRankingSubmitterRef } from '~/core/blocks/ranking/ranking-block-relations';
import { buildShortPersonalRankingSharePath } from '~/core/blocks/ranking/ranking-share';
import { useRankingVoters } from '~/core/blocks/ranking/use-ranking-voters';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

type Props = {
  refs: AggregatedRankingSubmitterRef[];
  count: number;
  children: React.ReactNode;
};

export function RankingVotersPill({ refs, count, children }: Props) {
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
          <RankingVotersList refs={refs} count={count} onNavigate={() => setOpen(false)} />
        </Content>
      </Portal>
    </Root>
  );
}

function RankingVotersList({
  refs,
  count,
  onNavigate,
}: {
  refs: AggregatedRankingSubmitterRef[];
  count: number;
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
          voters.map(voter => (
            <PrefetchLink
              key={voter.rankEntityId}
              href={buildShortPersonalRankingSharePath(voter.rankEntityId)}
              onClick={onNavigate}
              className="flex items-center gap-2 p-2 transition-colors duration-75 hover:bg-grey-01"
            >
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                <Avatar size={32} avatarUrl={voter.avatarUrl} value={voter.fallbackSeed} />
              </div>
              <p className="min-w-0 truncate text-metadataMedium text-text">
                {voter.name ?? (voter.address ? formatShortAddress(voter.address) : 'Anonymous')}
              </p>
            </PrefetchLink>
          ))
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
