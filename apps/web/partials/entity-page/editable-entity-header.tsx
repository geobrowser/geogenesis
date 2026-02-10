'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';
import Link from 'next/link';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { fetchEntityVersions, type EntityVersion } from '~/core/io/subgraph/fetch-entity-versions';
import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Create } from '~/design-system/icons/create';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryDiffSlideUp, type HistoryDiffSelection } from '../history/history-diff-slide-up';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { EntityPageMetadataHeader } from './entity-page-metadata-header';

const PAGE_SIZE = 10;

export function EditableHeading({ spaceId, entityId }: { spaceId: string; entityId: string }) {
  const { values } = useSyncEngine();

  const name = useSelector(values, v => {
    return v.find(
      v =>
        v.entity.id === entityId && v.spaceId === spaceId && v.property.id === SystemIds.NAME_PROPERTY && !v.isDeleted
    )?.value;
  });

  const isEditing = useUserIsEditing(spaceId);
  const { storage } = useMutate();

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [diffSelection, setDiffSelection] = React.useState<HistoryDiffSelection | null>(null);

  const {
    data: versionPages,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    enabled: isHistoryOpen,
    queryKey: [`entity-versions-rest-${entityId}`],
    queryFn: ({ signal, pageParam = 0 }) =>
      fetchEntityVersions({ entityId, limit: PAGE_SIZE, offset: pageParam * PAGE_SIZE, signal }),
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
    initialPageParam: 0,
  });

  const allVersions = React.useMemo(() => versionPages?.pages.flat() ?? [], [versionPages]);

  const onVersionClick = (version: EntityVersion, index: number) => {
    const nextVersion = allVersions[index + 1];
    if (!nextVersion) return;

    const date = new Date(version.createdAt);
    const dateLabel = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const label = version.name ?? `Changes from ${dateLabel}`;

    setDiffSelection({
      entityId,
      spaceId,
      fromEditId: nextVersion.editId,
      toEditId: version.editId,
      label,
    });
    setIsHistoryOpen(false);
  };

  const onNameChange = (value: string) => {
    storage.entities.name.set(entityId, spaceId, value);
  };

  const relations = useRelationEntityRelations(entityId, spaceId);
  const isRelationPage = relations.length > 0;

  return (
    <>
      <div className="relative flex items-center justify-between">
        {!isRelationPage ? (
          <>
            {isEditing ? (
              <div className="flex-grow">
                <PageStringField
                  variant="mainPage"
                  placeholder="Entity name..."
                  value={name ?? ''}
                  onChange={onNameChange}
                />
                {/* Manual spacing to match the <Text /> height and avoid layout shift */}
                <Spacer height={3.5} />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Text as="h1" variant="mainPage">
                    {name ?? ZERO_WIDTH_SPACE}
                  </Text>
                </div>
                <Spacer height={12} />
              </div>
            )}
          </>
        ) : (
          <EntityPageMetadataHeader id={entityId} spaceId={spaceId} isRelationPage={true} />
        )}

        <div className="flex items-center gap-5">
          {isEditing && (
            <Link
              href={NavUtils.toEntity(spaceId, ID.createEntityId())}
              className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
            >
              <Create />
            </Link>
          )}
          <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            {!isFetching && allVersions.length === 0 && <HistoryEmpty />}
            {allVersions.length <= 1 && allVersions.length > 0 && !isFetching && <HistoryEmpty />}
            {allVersions.length > 1 &&
              allVersions.map((v, index) => {
                if (index === allVersions.length - 1) return null;
                return (
                  <EntityVersionItem
                    key={v.editId}
                    createdAt={v.createdAt}
                    name={v.name}
                    createdBy={v.createdBy}
                    onClick={() => onVersionClick(v, index)}
                  />
                );
              })}
            {isFetching && allVersions.length === 0 && (
              <div className="flex h-12 w-full items-center justify-center bg-white">
                <Dots />
              </div>
            )}
            {hasNextPage && (
              <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
                {isFetchingNextPage ? (
                  <Dots />
                ) : (
                  <SmallButton variant="secondary" onClick={() => fetchNextPage()}>
                    Show more
                  </SmallButton>
                )}
              </div>
            )}
          </HistoryPanel>
          <EntityPageContextMenu entityId={entityId} entityName={name || ''} spaceId={spaceId} />
        </div>
      </div>

      <HistoryDiffSlideUp selection={diffSelection} onClose={() => setDiffSelection(null)} />
    </>
  );
}
