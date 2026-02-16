'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { useState } from 'react';

import { Source } from '~/core/blocks/data/source';
import { useMutate } from '~/core/sync/use-mutate';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { RightArrowLongChip } from '~/design-system/icons/right-arrow-long-chip';
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
                <EditModeNameField
                  name={name}
                  entityId={rowEntityId}
                  spaceId={currentSpaceId}
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

function EditModeNameField({
  name,
  entityId,
  spaceId,
  onChange,
}: {
  name: string | null;
  entityId: string;
  spaceId: string;
  onChange: (value: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="absolute -inset-2 z-0" />
      <div className="relative z-10">
        <div className="relative z-20 w-full">
          <PageStringField placeholder="Add name..." value={name ?? ''} onChange={onChange} />
        </div>
        <div className="pointer-events-none absolute inset-0 z-30">
          <span className="inline text-body opacity-0">{name || 'Add name...'}</span>
          {isHovered && (
            <Link
              href={NavUtils.toEntity(spaceId, entityId, true)}
              entityId={entityId}
              spaceId={spaceId}
              className="pointer-events-auto ml-1 inline-flex items-center text-grey-03 transition duration-300 ease-in-out hover:text-text"
            >
              <RightArrowLongChip />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
