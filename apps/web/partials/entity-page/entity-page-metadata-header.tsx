'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { EntityType } from '~/core/types';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import { HistoryEmpty, HistoryItem, HistoryPanel } from '../history';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { EntityPageTypeChip } from './entity-page-type-chip';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
  types: Array<EntityType>;
}

export function EntityPageMetadataHeader({ id, spaceId, types: serverTypes }: EntityPageMetadataHeaderProps) {
  const { subgraph, config } = Services.useServices();
  const {
    data: versions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`entity-versions-for-entityId-${id}`],
    queryFn: async ({ pageParam = 0 }) =>
      subgraph.fetchProposedVersions({ entityId: id, spaceId, page: pageParam, endpoint: config.subgraph }),
    getNextPageParam: (_lastPage, pages) => pages.length,
  });

  const { actionsFromSpace } = useActionsStore();
  const { triples } = useEntityPageStore();
  const { setCompareMode, setSelectedVersion, setPreviousVersion, setIsCompareOpen } = useDiff();

  const isOnePage = versions?.pages && versions.pages[0].length < 10;

  const isLastPage =
    versions?.pages &&
    versions.pages.length > 1 &&
    versions.pages[versions.pages.length - 1]?.[0]?.id === versions.pages[versions.pages.length - 2]?.[0]?.id;

  const renderedVersions = !isLastPage ? versions?.pages : versions?.pages.slice(0, -1);

  const showMore = !isOnePage && !isLastPage;
  const types = triples.length === 0 && actionsFromSpace.length === 0 ? serverTypes : Entity.types(triples);

  return (
    <div className="flex items-center justify-between text-text">
      <ul className="flex items-center gap-1">
        {types.map(t => (
          <li key={t.id}>
            <EntityPageTypeChip type={t} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <HistoryPanel>
          {versions?.pages?.length === 0 && <HistoryEmpty />}
          {renderedVersions?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map((v, index) => (
                <HistoryItem
                  key={v.id}
                  onClick={() => {
                    setCompareMode('versions');
                    setPreviousVersion(group[index + 1]?.id ?? '');
                    setSelectedVersion(v.id);
                    setIsCompareOpen(true);
                  }}
                  changeCount={Action.getChangeCount(v.actions)}
                  createdAt={v.createdAt}
                  createdBy={v.createdBy}
                  name={v.name}
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
        <EntityPageContextMenu entityId={id} spaceId={spaceId} />
      </div>
    </div>
  );
}

interface SpacePageMetadataHeaderProps {
  spaceId: string;
}

export function SpacePageMetadataHeader({ spaceId }: SpacePageMetadataHeaderProps) {
  const [open, onOpenChange] = React.useState(false);
  const pathname = usePathname();

  const { subgraph, config } = Services.useServices();

  const {
    data: proposals,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: async ({ pageParam = 0 }) =>
      subgraph.fetchProposals({ spaceId, endpoint: config.subgraph, page: pageParam }),
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
    <div className="flex items-center justify-between text-text">
      <div className="flex">
        <span className="mt-1 inline-block rounded bg-text px-[7px] py-px text-sm font-medium text-white">Space</span>
      </div>
      <div className="inline-flex items-center gap-4">
        <HistoryPanel>
          {proposals?.pages?.length === 1 && proposals?.pages[0].length === 0 && <HistoryEmpty />}
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
        <Menu
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
          className="max-w-[5.8rem] whitespace-nowrap"
        >
          <Link
            href={`${pathname}/entities`}
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
          >
            <Text variant="button" className="hover:!text-text">
              View data
            </Text>
          </Link>
        </Menu>
      </div>
    </div>
  );
}
