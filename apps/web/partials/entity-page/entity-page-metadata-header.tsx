'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { fetchHistoryVersions } from '~/core/io/subgraph/fetch-history-versions';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Create } from '~/design-system/icons/create';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { RelationsGroup } from './editable-entity-page';
import { EntityPageContextMenu } from './entity-page-context-menu';

interface EntityPageMetadataHeaderProps {
  id: string;
  entityName: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, entityName, spaceId }: EntityPageMetadataHeaderProps) {
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  const [addTypeState, setAddTypeState] = React.useState(false);

  const {
    data: versions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    enabled: isHistoryOpen,
    queryKey: [`entity-versions-for-entityId-${id}`],
    queryFn: ({ signal, pageParam = 0 }) => fetchHistoryVersions({ entityId: id, page: pageParam, signal }),
    getNextPageParam: (_lastPage, pages) => pages.length,
    initialPageParam: 0,
  });

  const { types } = useEntityPageStore();

  const isOnePage = versions?.pages && versions.pages[0].length < 5;

  const isLastPage =
    versions?.pages &&
    versions.pages.length > 1 &&
    versions.pages[versions.pages.length - 1]?.[0]?.id === versions.pages[versions.pages.length - 2]?.[0]?.id;

  const renderedVersions = !isLastPage ? versions?.pages : versions?.pages.slice(0, -1);
  const showMore = !isOnePage && !isLastPage;

  //////

  const { id: entityId } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables([], spaceId, isRelationPage);

  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));

  const typesRenderable = Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (renderableType === 'RELATION' && firstRenderable.attributeId === 'Jfmby78N4BCseZinBmdVov') {
      return renderables;
    }
  });

  const typesRenderableObj = typesRenderable.find(r => r?.find(re => re.attributeId === 'Jfmby78N4BCseZinBmdVov'));

  ////////

  return (
    <div className="flex items-center justify-between text-text">
      {/* <ul className="flex items-center gap-1">
            {types.map(t => (
              <li key={t.id}>
                <EntityPageTypeChip type={t} />
              </li>
            ))}
      </ul> */}
      {editable && (
        <div>
          {(typesRenderableObj && types.length > 0) || (addTypeState && types.length === 0) ? (
            <RelationsGroup
              key="Jfmby78N4BCseZinBmdVov"
              relations={typesRenderableObj as RelationRenderableProperty[]}
              properties={properties}
            />
          ) : (
            <button
              onClick={() => setAddTypeState(true)}
              className="flex h-6 items-center gap-[6px] rounded border border-dashed border-grey-02 px-2"
            >
              <Create color="grey-04" className="h-3 w-3" /> type
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-5">
        <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {versions?.pages?.length === 0 && <HistoryEmpty />}
          {renderedVersions?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map(v => (
                <HistoryItem
                  key={v.id}
                  spaceId={spaceId}
                  proposalId={v.proposalId}
                  createdAt={v.createdAt}
                  createdBy={v.createdBy}
                  name={v.editName}
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
        <EntityPageContextMenu entityId={id} entityName={entityName} spaceId={spaceId} />
      </div>
    </div>
  );
}
