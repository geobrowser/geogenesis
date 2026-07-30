'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import Link from 'next/link';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Create } from '~/design-system/icons/create';

import { HistoryDiffSlideUp } from '../history/history-diff-slide-up';
import { HistoryEmpty } from '../history/history-empty';
import { EntityVersionItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { useEntityHistory } from '../history/use-entity-history';
import { EntityPageContextMenu } from './entity-page-context-menu';
import { EntityPageTitle } from './entity-page-title';

export function EditableHeading({
  spaceId,
  entityId,
  fallbackName,
}: {
  spaceId: string;
  entityId: string;
  /** Shown in browse mode when the scoped store has no name yet (e.g. ranking row preview). */
  fallbackName?: string | null;
}) {
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

  return (
    <>
      <div className="relative flex items-center justify-between gap-4">
        <EntityPageTitle
          value={name ?? fallbackName ?? ''}
          isEditing={isEditing}
          onChange={onNameChange}
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 items-center gap-5">
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
