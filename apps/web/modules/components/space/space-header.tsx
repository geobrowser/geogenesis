'use client';

import * as React from 'react';
import Image from 'next/legacy/image';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Text } from '~/modules/design-system/text';
import { ZERO_WIDTH_SPACE } from '../../constants';
import { HistoryPanel, HistoryItem } from '../history';
import { Action as IAction } from '~/modules/types';
import { Action } from '~/modules/action';
import { Services } from '~/modules/services';
import { useDiff } from '~/modules/diff';
import { Dots } from '~/modules/design-system/dots';
import { SmallButton } from '~/modules/design-system/button';
import { HistoryEmpty } from '../history';
import { getImagePath } from '~/modules/utils';

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
