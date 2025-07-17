import { ContentIds, SystemIds } from '@graphprotocol/grc-20';
import NextImage from 'next/image';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { Cell, Property } from '~/core/v2.types';

import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  isPlaceholder: boolean;
  properties?: Record<string, Property>;
  relationId?: string;
  source: Source;
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
  relationId,
  source,
}: Props) {
  const nameCell: Cell | undefined = columns[SystemIds.NAME_PROPERTY];

  const { propertyId: cellId, verified } = nameCell;
  let { image, description } = nameCell;

  const name = useName(rowEntityId);

  const descriptionValues = useValues({
    selector: v => v.entity.id === rowEntityId && v.property.id === SystemIds.DESCRIPTION_PROPERTY,
  });

  const maybeDescriptionInSpace = descriptionValues.find(r => r.spaceId === currentSpaceId)?.value;
  const maybeDescription = maybeDescriptionInSpace ?? descriptionValues[0]?.value;

  if (maybeDescription) {
    description = maybeDescription;
  }

  const avatarRelations = useRelations({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeAvatarUrl = avatarRelations[0]?.toEntity.value;

  const coverRelations = useRelations({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeCoverUrl = coverRelations[0]?.toEntity.value;

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  if (maybeCoverUrl) {
    image = maybeCoverUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SystemIds.NAME_PROPERTY &&
      c.slotId !== ContentIds.AVATAR_PROPERTY &&
      c.slotId !== SystemIds.COVER_PROPERTY
  );

  /**
   * We render descriptions in a specific style, but want to treat whether to render the description
   * at all the same way we treat any toggleable field.
   *
   * To do this we read description data from the row like every other optional data, but filter it
   * out of rendering at read-time. Then we can render it it's unique way.
   */
  const propertyDataHasDescription = otherPropertyData.some(c => c.slotId === SystemIds.DESCRIPTION_PROPERTY);

  if (isEditing && source.type !== 'RELATIONS') {
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
                // const { id: imageId, ops } = Image.make({ cid: imageSrc });
                // const [createRelationOp, setTripleOp] = ops;
                // if (createRelationOp.type === 'CREATE_RELATION') {
                //   const imageEntityDispatch = editEvent({
                //     context: {
                //       entityId: createRelationOp.relation.fromEntity,
                //       entityName: null,
                //       spaceId: currentSpaceId,
                //     },
                //   });
                //   imageEntityDispatch({
                //     type: 'UPSERT_RELATION',
                //     payload: {
                //       fromEntityId: createRelationOp.relation.fromEntity,
                //       fromEntityName: name,
                //       toEntityId: createRelationOp.relation.toEntity,
                //       toEntityName: null,
                //       typeOfId: createRelationOp.relation.type,
                //       typeOfName: 'Types',
                //     },
                //   });
                //   if (setTripleOp.type === 'SET_TRIPLE') {
                //     imageEntityDispatch({
                //       type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                //       payload: {
                //         renderable: {
                //           attributeId: setTripleOp.triple.attribute,
                //           entityId: imageId,
                //           spaceId: currentSpaceId,
                //           attributeName: 'Image URL',
                //           entityName: null,
                //           type: 'URL',
                //           value: setTripleOp.triple.value.value,
                //         },
                //         value: {
                //           type: 'URL',
                //           value: setTripleOp.triple.value.value,
                //         },
                //       },
                //     });
                //     onChangeEntry(
                //       {
                //         entityId: rowEntityId,
                //         entityName: name,
                //         spaceId: currentSpaceId,
                //       },
                //       {
                //         type: 'EVENT',
                //         data: {
                //           type: 'UPSERT_RELATION',
                //           payload: {
                //             fromEntityId: rowEntityId,
                //             fromEntityName: name,
                //             toEntityId: imageId,
                //             toEntityName: null,
                //             typeOfId: ContentIds.AVATAR_PROPERTY,
                //             typeOfName: 'Avatar',
                //             renderableType: 'IMAGE',
                //             value: setTripleOp.triple.value.value,
                //           },
                //         },
                //       }
                //     );
                // }
                // }
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 px-1">
          <div>
            <div className="text-metadata text-grey-04">Name</div>
            {isPlaceholder && source.type === 'COLLECTION' ? (
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
            ) : (
              <>
                {source.type !== 'COLLECTION' ? (
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
                                attributeId: SystemIds.NAME_PROPERTY,
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
                                  attributeId: SystemIds.NAME_PROPERTY,
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
            otherPropertyData.map(p => {
              const property = properties?.[p.slotId];

              if (!property) {
                return null;
              }

              return (
                <div key={p.slotId}>
                  <TableBlockPropertyField
                    key={p.slotId}
                    spaceId={currentSpaceId}
                    entityId={rowEntityId}
                    property={property}
                    onChangeEntry={onChangeEntry}
                    source={source}
                  />
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <Link
      entityId={rowEntityId}
      spaceId={currentSpaceId}
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
              entityId={rowEntityId} spaceId={currentSpaceId}
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
              <Link
                entityId={rowEntityId}
                spaceId={currentSpaceId}
                href={href}
                className="text-smallTitle font-medium text-text"
              >
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
            const property = properties?.[p.slotId];

            if (!property) {
              return null;
            }

            return (
              <TableBlockPropertyField
                key={p.slotId}
                property={property}
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
