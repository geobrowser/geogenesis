'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { Source } from '~/core/blocks/data/source';
import { useMutate } from '~/core/sync/use-mutate';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

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
}: Props) {
  const { storage } = useMutate();
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const { propertyId: cellId, verified } = nameCell;

  const name = useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })?.value ?? null;

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full gap-2 px-1 py-0.5">
        <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder && source.type === 'COLLECTION' ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
              }}
              onDone={(result, fromCreateFn) => {
                if (fromCreateFn) return;
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
              }}
              spaceId={currentSpaceId}
              autoFocus={autoFocus}
            />
          ) : (
            <div>
              {source.type !== 'COLLECTION' ? (
                <PageStringField
                  placeholder="Add name..."
                  onChange={value => {
                    onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
                  }}
                  value={name ?? ''}
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
    <div className="group relative flex w-full gap-2 rounded-md px-1 py-0.5 transition duration-200 hover:bg-divider">
      <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
      {source.type !== 'COLLECTION' ? (
        <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="text-body">
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
        >
          <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="text-body">
            {name}
          </Link>
        </CollectionMetadata>
      )}
    </div>
  );
}
