'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { EntityType } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';

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
