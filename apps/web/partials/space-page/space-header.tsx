'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';
import { getImagePath } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Text } from '~/design-system/text';

import { HistoryItem, HistoryPanel } from '../history';
import { HistoryEmpty } from '../history';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceId, spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const { network } = Services.useServices();

  const {
    data: proposals,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: async ({ pageParam = 0 }) => network.fetchProposals(spaceId, undefined, pageParam),
    getNextPageParam: (_lastPage, pages) => pages.length,
  });

  const { setCompareMode, setSelectedProposal, setPreviousProposal, setIsCompareOpen } = useDiff();

  const isOnePage = proposals?.pages && proposals.pages[0].length < 10;

  const isLastPage =
    proposals?.pages &&
    proposals.pages.length > 1 &&
    proposals.pages[proposals.pages.length - 1]?.[0]?.id === proposals.pages[proposals.pages.length - 2]?.[0]?.id;

  const renderedProposals = !isLastPage ? proposals?.pages : proposals?.pages.slice(0, -1);

  const showMore = !isOnePage && !isLastPage;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-5">
        <div className="relative h-14 w-14 overflow-hidden rounded">
          <Image
            objectFit="cover"
            layout="fill"
            src={getImagePath(spaceImage ?? '') || 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
        </div>
        <Text variant="mainPage" as="h1">
          {spaceName}
        </Text>
      </div>
      <HistoryPanel>
        {proposals?.pages?.length === 0 && <HistoryEmpty />}
        {renderedProposals?.map((group, index) => (
          <React.Fragment key={index}>
            {group.map((p, index) => (
              <HistoryItem
                key={p.id}
                onClick={() => {
                  setCompareMode('proposals');
                  setPreviousProposal(group[index + 1]?.id ?? '');
                  setSelectedProposal(p.id);
                  setIsCompareOpen(true);
                }}
                changeCount={Action.getChangeCount(
                  p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
                )}
                createdAt={p.createdAt}
                createdBy={p.createdBy}
                name={p.name}
              />
            ))}
          </React.Fragment>
        ))}
        {showMore && (
          <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
            {isFetching || isFetchingNextPage ? (
              <Dots />
            ) : (
              <SmallButton variant="secondary" onClick={() => fetchNextPage()}>
                Show more
              </SmallButton>
            )}
          </div>
        )}
      </HistoryPanel>
    </div>
  );
}
