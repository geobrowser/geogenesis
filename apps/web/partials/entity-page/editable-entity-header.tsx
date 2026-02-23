'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useSelector } from '@xstate/store/react';
import Link from 'next/link';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
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

import { HistoryDiffSlideUp } from '../history/history-diff-slide-up';
import { HistoryEmpty } from '../history/history-empty';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { useEntityHistory } from '../history/use-entity-history';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { EntityPageMetadataHeader } from './entity-page-metadata-header';

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

  const {
    allVersions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    diffSelection,
    onVersionClick,
    clearDiffSelection,
  } = useEntityHistory({ entityId, spaceId, enabled: isHistoryOpen });

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
              <div className="grow text-text">
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
            {allVersions.map((v, index) => (
              <EntityVersionItem
                key={v.editId}
                createdAt={v.createdAt}
                name={v.name}
                createdById={v.createdById}
                createdBy={v.createdBy}
                onClick={() => {
                  onVersionClick(v, index);
                  setIsHistoryOpen(false);
                }}
              />
            ))}
            {isFetching && allVersions.length === 0 && (
              <div className="flex h-12 w-full items-center justify-center bg-white">
                <Dots />
              </div>
            )}
            {hasNextPage && (
              <div className="flex h-12 w-full shrink-0 items-center justify-center bg-white">
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

      <HistoryDiffSlideUp selection={diffSelection} onClose={clearDiffSelection} />
    </>
  );
}
