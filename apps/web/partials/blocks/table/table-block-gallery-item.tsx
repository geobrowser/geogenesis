import { ContentIds, GraphUrl, Image, SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import NextImage from 'next/image';
import Link from 'next/link';

import type { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { editEvent } from '~/core/events/edit-events';
import { PropertyId } from '~/core/hooks/use-properties';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { Cell, PropertySchema } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { getName } from '~/partials/blocks/table/utils';

import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  isPlaceholder: boolean;
  properties?: Record<PropertyId, PropertySchema>;
  linkedEntityId: string;
  relationId?: string;
  source: Source;
  filterState: Filter[];
};

export function TableBlockGalleryItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  onChangeEntry,
  onLinkEntry,
  isPlaceholder,
  properties,
  linkedEntityId,
  relationId,
  source,
  filterState,
}: Props) {
  const nameCell: Cell | undefined = columns[SystemIds.NAME_ATTRIBUTE];
  const maybeDescriptionData: Cell | undefined = columns[SystemIds.DESCRIPTION_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[ContentIds.AVATAR_ATTRIBUTE];
  const maybeCoverData: Cell | undefined = columns[SystemIds.COVER_ATTRIBUTE];

  const { cellId, verified } = nameCell;
  let { image, description } = nameCell;

  const name = getName(nameCell, currentSpaceId);

  const maybeDescriptionInSpace = maybeDescriptionData?.renderables.find(
    r => r.attributeId === SystemIds.DESCRIPTION_ATTRIBUTE && r.spaceId === currentSpaceId
  )?.value;

  const maybeDescription =
    maybeDescriptionInSpace ??
    maybeDescriptionData?.renderables.find(r => r.attributeId === SystemIds.DESCRIPTION_ATTRIBUTE)?.value;

  if (maybeDescription) {
    description = maybeDescription;
  }

  const maybeAvatarUrl = maybeAvatarData?.renderables.find(r => r.attributeId === ContentIds.AVATAR_ATTRIBUTE)?.value;

  const maybeCoverUrl = maybeCoverData?.renderables.find(r => r.attributeId === SystemIds.COVER_ATTRIBUTE)?.value;

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  if (maybeCoverUrl) {
    image = maybeCoverUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SystemIds.NAME_ATTRIBUTE &&
      c.slotId !== ContentIds.AVATAR_ATTRIBUTE &&
      c.slotId !== SystemIds.COVER_ATTRIBUTE
  );

  /**
   * We render descriptions in a specific style, but want to treat whether to render the description
   * at all the same way we treat any toggleable field.
   *
   * To do this we read description data from the row like every other optional data, but filter it
   * out of rendering at read-time. Then we can render it it's unique way.
   */
  const propertyDataHasDescription = otherPropertyData.some(c => c.slotId === SystemIds.DESCRIPTION_ATTRIBUTE);

  if (isEditing) {
    return (
      <div className="group flex flex-col gap-3 rounded-[17px] p-[5px] py-2">
        <div className="relative flex aspect-[2/1] w-full items-center justify-center overflow-clip rounded-lg bg-grey-01">
          {image ? (
            <NextImage
              src={getImagePath(image)}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          ) : (
            <BlockImageField
              variant="gallery"
              imageSrc={image ?? undefined}
              onImageChange={imageSrc => {
                const { id: imageId, ops } = Image.make({ cid: imageSrc });
                const [createRelationOp, setTripleOp] = ops;

                if (createRelationOp.type === 'CREATE_RELATION') {
                  const imageEntityDispatch = editEvent({
                    context: {
                      entityId: createRelationOp.relation.fromEntity,
                      entityName: null,
                      spaceId: currentSpaceId,
                    },
                  });

                  imageEntityDispatch({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: createRelationOp.relation.fromEntity,
                      fromEntityName: name,
                      toEntityId: createRelationOp.relation.toEntity,
                      toEntityName: null,
                      typeOfId: createRelationOp.relation.type,
                      typeOfName: 'Types',
                    },
                  });

                  if (setTripleOp.type === 'SET_TRIPLE') {
                    imageEntityDispatch({
                      type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                      payload: {
                        renderable: {
                          attributeId: setTripleOp.triple.attribute,
                          entityId: imageId,
                          spaceId: currentSpaceId,
                          attributeName: 'Image URL',
                          entityName: null,
                          type: 'URL',
                          value: setTripleOp.triple.value.value,
                        },
                        value: {
                          type: 'URL',
                          value: setTripleOp.triple.value.value,
                        },
                      },
                    });

                    onChangeEntry(
                      {
                        entityId: rowEntityId,
                        entityName: name,
                        spaceId: currentSpaceId,
                      },
                      {
                        type: 'EVENT',
                        data: {
                          type: 'UPSERT_RELATION',
                          payload: {
                            fromEntityId: rowEntityId,
                            fromEntityName: name,
                            toEntityId: imageId,
                            toEntityName: null,
                            typeOfId: ContentIds.AVATAR_ATTRIBUTE,
                            typeOfName: 'Avatar',
                            renderableType: 'IMAGE',
                            value: setTripleOp.triple.value.value,
                          },
                        },
                      }
                    );
                  }
                }
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 px-1">
          <div>
            <div className="text-metadata text-grey-04">Name</div>
            {isPlaceholder && ['COLLECTION', 'RELATIONS'].includes(source.type) ? (
              <>
                {source.type === 'COLLECTION' && (
                  <SelectEntity
                    onCreateEntity={result => {
                      // This actually works quite differently than other creates since
                      // we want to use the existing placeholder entity id.
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
                      //
                      // @TODO: When do we use the placeholder and when we use the real entity id?
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
                )}
                {source.type === 'RELATIONS' && (
                  <SelectEntity
                    onCreateEntity={result => {
                      const typeFilter = filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_ATTRIBUTE);

                      if (!typeFilter) return;

                      const newRelationId = ID.createEntityId();
                      const spaceId = currentSpaceId;
                      const id = source.value;
                      const typeOfId = typeFilter.value;
                      const typeOfName = typeFilter.valueName;

                      DB.upsert(
                        {
                          entityId: result.id,
                          attributeId: SystemIds.NAME_ATTRIBUTE,
                          entityName: result.name,
                          attributeName: 'Name',
                          value: {
                            type: 'TEXT',
                            value: result.name ?? '',
                          },
                        },
                        spaceId
                      );

                      const newRelation: StoreRelation = {
                        id: newRelationId,
                        space: spaceId,
                        index: INITIAL_RELATION_INDEX_VALUE,
                        typeOf: {
                          id: EntityId(typeOfId),
                          name: typeOfName,
                        },
                        fromEntity: {
                          id: EntityId(id),
                          name: name,
                        },
                        toEntity: {
                          id: EntityId(result.id),
                          name: result.name,
                          renderableType: 'RELATION',
                          value: EntityId(result.id),
                        },
                      };

                      DB.upsertRelation({
                        relation: newRelation,
                        spaceId,
                      });
                    }}
                    onDone={(result, fromCreateFn) => {
                      if (fromCreateFn) {
                        return;
                      }

                      const typeFilter = filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_ATTRIBUTE);

                      if (!typeFilter) return;

                      const newRelationId = ID.createEntityId();
                      const spaceId = currentSpaceId;
                      const id = source.value;
                      const typeOfId = typeFilter.value;
                      const typeOfName = typeFilter.valueName;

                      const newRelation: StoreRelation = {
                        id: newRelationId,
                        space: spaceId,
                        index: INITIAL_RELATION_INDEX_VALUE,
                        typeOf: {
                          id: EntityId(typeOfId),
                          name: typeOfName,
                        },
                        fromEntity: {
                          id: EntityId(id),
                          name: name,
                        },
                        toEntity: {
                          id: EntityId(result.id),
                          name: result.name,
                          renderableType: 'RELATION',
                          value: EntityId(result.id),
                        },
                      };

                      DB.upsertRelation({
                        relation: newRelation,
                        spaceId,
                      });

                      if (result.space) {
                        DB.upsert(
                          {
                            attributeId: SystemIds.RELATION_TO_ATTRIBUTE,
                            attributeName: 'To Entity',
                            entityId: newRelationId,
                            entityName: null,
                            value: {
                              type: 'URL',
                              value: GraphUrl.fromEntityId(result.id, { spaceId: result.space }),
                            },
                          },
                          spaceId
                        );
                      }
                    }}
                    spaceId={currentSpaceId}
                  />
                )}
              </>
            ) : (
              <>
                {source.type !== 'COLLECTION' ? (
                  <PageStringField
                    placeholder="Entity name..."
                    value={name ?? ''}
                    onChange={value => {
                      onChangeEntry(
                        {
                          entityId: source.type === 'RELATIONS' ? linkedEntityId : rowEntityId,
                          entityName: value,
                          spaceId: currentSpaceId,
                        },
                        {
                          type: 'EVENT',
                          data: {
                            type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                            payload: {
                              renderable: {
                                attributeId: SystemIds.NAME_ATTRIBUTE,
                                entityId: source.type === 'RELATIONS' ? linkedEntityId : rowEntityId,
                                spaceId: currentSpaceId,
                                attributeName: 'Name',
                                entityName: name,
                                type: 'TEXT',
                                value: name ?? '',
                              },
                              value: { type: 'TEXT', value },
                            },
                          },
                        }
                      );
                    }}
                  />
                ) : (
                  <CollectionMetadata
                    view="GALLERY"
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
                      placeholder="Entity name..."
                      value={name ?? ''}
                      onChange={value => {
                        onChangeEntry(
                          {
                            entityId: rowEntityId,
                            entityName: value,
                            spaceId: currentSpaceId,
                          },
                          {
                            type: 'EVENT',
                            data: {
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable: {
                                  attributeId: SystemIds.NAME_ATTRIBUTE,
                                  entityId: rowEntityId,
                                  spaceId: currentSpaceId,
                                  attributeName: 'Name',
                                  entityName: name,
                                  type: 'TEXT',
                                  value: name ?? '',
                                },
                                value: { type: 'TEXT', value },
                              },
                            },
                          }
                        );
                      }}
                    />
                  </CollectionMetadata>
                )}
              </>
            )}
          </div>
          {!isPlaceholder &&
            source.type !== 'RELATIONS' && // @TODO restore after GRC-20
            otherPropertyData.map(p => {
              return (
                <div key={p.slotId}>
                  <TableBlockPropertyField
                    key={p.slotId}
                    renderables={
                      nameCell?.space ? p.renderables.filter(r => r.spaceId === nameCell.space) : p.renderables
                    }
                    spaceId={currentSpaceId}
                    entityId={rowEntityId}
                    properties={properties}
                    onChangeEntry={onChangeEntry}
                    source={source}
                  />
                </div>
              );
            })}
          {/* @TODO remove after GRC-20 */}
          {!isPlaceholder && source.type === 'RELATIONS' && otherPropertyData.length > 0 && (
            <span className="inline-block rounded border border-dashed border-grey-04 px-2 py-1 text-metadata text-grey-04">
              Additional properties in browse mode.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[17px] p-[5px] py-2 transition duration-200 hover:bg-divider"
    >
      <div className="relative aspect-[2/1] w-full overflow-clip rounded-lg bg-grey-01">
        <NextImage
          src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
          className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
          alt=""
          fill
        />
      </div>
      <div className="flex w-full flex-col px-1">
        <div className="flex flex-col gap-2">
          {source.type !== 'COLLECTION' ? (
            <Link href={href} className="text-smallTitle font-medium text-text">
              {name || rowEntityId}
            </Link>
          ) : (
            <CollectionMetadata
              view="GALLERY"
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
              <Link href={href} className="text-smallTitle font-medium text-text">
                {name || rowEntityId}
              </Link>
            </CollectionMetadata>
          )}
          {description && propertyDataHasDescription && (
            <div className="line-clamp-4 text-metadata text-text md:line-clamp-3">{description}</div>
          )}
        </div>

        {otherPropertyData
          .filter(p => p.slotId !== SystemIds.DESCRIPTION_PROPERTY)
          .map(p => {
            return (
              <TableBlockPropertyField
                key={p.slotId}
                renderables={
                  nameCell?.space
                    ? p.renderables.filter(r => Boolean(r.placeholder) === false && r.spaceId === nameCell.space)
                    : p.renderables.filter(r => Boolean(r.placeholder) === false)
                }
                spaceId={currentSpaceId}
                entityId={cellId}
                onChangeEntry={onChangeEntry}
                source={source}
              />
            );
          })}
      </div>
    </Link>
  );
}
