'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Source } from '~/core/blocks/data/source';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';
import { EditModeNameField } from '~/partials/blocks/table/edit-mode-name-field';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  isPlaceholder: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  relationId?: string;
  source: Source;
  autoFocus?: boolean;
  focusRequestKey?: number;
  collectionTypeFilters?: { id: string; name: string | null }[];
};

export function TableBlockBulletedListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  isPlaceholder,
  onChangeEntry,
  onLinkEntry,
  relationId,
  source,
  autoFocus = false,
  focusRequestKey,
  collectionTypeFilters,
}: Props) {
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const { propertyId: cellId, verified } = nameCell;

  const name =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })
      ?.value ?? null;

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full gap-2 px-1 py-0.5">
        <div className="mt-1 shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder && source.type === 'COLLECTION' ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
                return rowEntityId;
              }}
              onDone={(result, fromCreateFn) => {
                if (fromCreateFn) return;
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
              }}
              spaceId={currentSpaceId}
              autoFocus={autoFocus}
              focusRequestKey={focusRequestKey}
              relationValueTypes={collectionTypeFilters}
            />
          ) : (
            <div>
              {source.type !== 'COLLECTION' ? (
                <EditModeNameField
                  name={name}
                  entityId={rowEntityId}
                  spaceId={currentSpaceId}
                  entitySpaceIdForPanel={nameCell?.space ?? currentSpaceId}
                  openedWithMainViewEditing={isEditing}
                  placeholder="Add name..."
                  onChange={value => {
                    onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
                  }}
                />
              ) : (
                <CollectionMetadata
                  view="BULLETED_LIST"
                  isEditing={true}
                  name={name}
                  currentSpaceId={currentSpaceId}
                  entityId={rowEntityId}
                  spaceId={nameCell?.space}
                  collectionId={nameCell?.collectionId}
                  relationId={relationId}
                  verified={verified}
                  onLinkEntry={onLinkEntry}
                  showSidePanel={!isPlaceholder}
                  openedWithMainViewEditing={isEditing}
                >
                  <PageStringField
                    placeholder="Add name..."
                    onChange={value => {
                      onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
                    }}
                    value={name ?? ''}
                  />
                </CollectionMetadata>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex w-full items-start gap-2 rounded-md px-1 py-0.5 transition duration-200 hover:bg-divider">
      <div className="mt-1 shrink-0 text-xl leading-none text-text">•</div>
      <div className="relative min-w-0 flex-1">
        <div className="hidden md:float-right md:ml-2 md:block md:translate-y-[5px]">
          <EntityVoteButtons entityId={rowEntityId} spaceId={currentSpaceId} />
        </div>
        {source.type !== 'COLLECTION' ? (
          <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="block min-w-0 text-body">
            {name}
          </Link>
        ) : (
          <CollectionMetadata
            view="BULLETED_LIST"
            isEditing={false}
            name={name}
            currentSpaceId={currentSpaceId}
            entityId={rowEntityId}
            spaceId={nameCell?.space}
            collectionId={nameCell?.collectionId}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
            showSidePanel={!isPlaceholder}
            openedWithMainViewEditing={isEditing}
          >
            <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="min-w-0 flex-1 text-body">
              {name}
            </Link>
          </CollectionMetadata>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 md:hidden">
        {!isPlaceholder && source.type !== 'COLLECTION' && (
          <div className="invisible flex items-center opacity-0 transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 [&>button]:h-5 [&>button]:w-5">
            <DataBlockOpenSidePanelButton
              entityId={rowEntityId}
              entitySpaceId={nameCell?.space ?? currentSpaceId}
              openedWithMainViewEditing={isEditing}
            />
          </div>
        )}
        <EntityVoteButtons entityId={rowEntityId} spaceId={currentSpaceId} />
      </div>
    </div>
  );
}
