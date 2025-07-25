import { SystemIds } from '@graphprotocol/grc-20';

import { Source } from '~/core/blocks/data/source';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';
import { Cell, Property } from '~/core/v2.types';

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
}: Props) {
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const { propertyId: cellId, verified } = nameCell;

  // const name = getName(nameCell, currentSpaceId);
  const name = useName(rowEntityId);

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full gap-2 px-1 py-0.5">
        <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder && source.type === 'COLLECTION' ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(
                  {
                    entityId: rowEntityId,
                    entityName: result.name,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'Create',
                    data: result,
                  }
                );
              }}
              onDone={(result, fromCreateFn) => {
                if (fromCreateFn) {
                  // We bail out in the case that we're receiving the onDone
                  // callback from within the create entity function internal
                  // to SelectEntity.
                  return;
                }

                // This actually works quite differently than other creates since
                // we want to use the existing placeholder entity id.
                onChangeEntry(
                  {
                    entityId: rowEntityId,
                    entityName: result.name,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'Find',
                    data: result,
                  }
                );
              }}
              spaceId={currentSpaceId}
            />
          ) : (
            <div>
              {source.type !== 'COLLECTION' ? (
                <PageStringField
                  placeholder="Add name..."
                  onChange={value => {
                    onChangeEntry(
                      {
                        entityId: rowEntityId,
                        entityName: name,
                        spaceId: currentSpaceId,
                      },
                      {
                        type: 'EVENT',
                        data: {
                          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                          payload: {
                            renderable: {
                              attributeId: SystemIds.NAME_PROPERTY,
                              entityId: rowEntityId,
                              spaceId: currentSpaceId,
                              attributeName: 'Name',
                              entityName: name,
                              type: 'TEXT',
                              value: name ?? '',
                            },
                            value: { type: 'TEXT', value: value },
                          },
                        },
                      }
                    );
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
                      onChangeEntry(
                        {
                          entityId: rowEntityId,
                          entityName: name,
                          spaceId: currentSpaceId,
                        },
                        {
                          type: 'EVENT',
                          data: {
                            type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                            payload: {
                              renderable: {
                                attributeId: SystemIds.NAME_PROPERTY,
                                entityId: rowEntityId,
                                spaceId: currentSpaceId,
                                attributeName: 'Name',
                                entityName: name,
                                type: 'TEXT',
                                value: name ?? '',
                              },
                              value: { type: 'TEXT', value: value },
                            },
                          },
                        }
                      );
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
