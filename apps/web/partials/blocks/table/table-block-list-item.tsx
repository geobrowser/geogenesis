'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import NextImage from 'next/image';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelation, useValues } from '~/core/sync/use-store';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';
import { Cell, Property } from '~/core/types';

import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { DEFAULT_IMAGE_SIZES, GeoImage } from '~/design-system/geo-image';
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
  isPlaceholder: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  relationId?: string;
  source: Source;
  autoFocus?: boolean;
};

export function TableBlockListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  isPlaceholder,
  onChangeEntry,
  onLinkEntry,
  properties,
  relationId,
  source,
  autoFocus = false,
}: Props) {
  const { storage } = useMutate();
  const nameCell = columns[SystemIds.NAME_PROPERTY];

  const { propertyId: cellId, verified } = nameCell;
  let { description, image } = nameCell;

  const name = useName(rowEntityId);

  const descriptionValues = useValues({
    selector: v => v.entity.id === rowEntityId && v.property.id === SystemIds.DESCRIPTION_PROPERTY,
  });

  const nameValues = useValues({
    selector: v => v.entity.id === rowEntityId && v.property.id === SystemIds.NAME_PROPERTY,
  });
  const nameValueId = nameValues[0]?.id;
  const descriptionValueId = descriptionValues[0]?.id;

  const maybeDescriptionInSpace = descriptionValues.find(r => r.spaceId === currentSpaceId)?.value;
  const maybeDescription = maybeDescriptionInSpace ?? descriptionValues[0]?.value;

  if (maybeDescription) {
    description = maybeDescription;
  }

  const avatarRelation = useRelation({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeAvatarUrl = avatarRelation?.toEntity.value;

  const coverRelation = useRelation({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeCoverUrl = coverRelation?.toEntity.value;

  // Check which image property is selected to be shown in the collection
  const showAvatar = columns[ContentIds.AVATAR_PROPERTY] !== undefined;
  const showCover = columns[SystemIds.COVER_PROPERTY] !== undefined;

  // Reset image to undefined, then only set it based on what's selected
  // This prevents fallback to nameCell.image when the selected property doesn't exist
  if (showAvatar || showCover) {
    image = undefined;
  }

  // Only use avatar if it's selected to be shown
  if (showAvatar && maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  // Only use cover if it's selected to be shown (cover takes priority if both are shown)
  if (showCover && maybeCoverUrl) {
    image = maybeCoverUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SystemIds.NAME_PROPERTY &&
      c.slotId !== ContentIds.AVATAR_PROPERTY &&
      c.slotId !== SystemIds.COVER_PROPERTY &&
      c.slotId !== SystemIds.DESCRIPTION_PROPERTY
  );

  const imageUrl = useImageUrlFromEntity(image || undefined, currentSpaceId || '');
  if (image && imageUrl) {
    image = imageUrl;
  }

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full max-w-full items-start justify-start gap-6 p-1 pr-5">
        <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-clip rounded-[0.625rem] bg-grey-01">
          {image ? (
            <GeoImage
              value={image}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          ) : (
            <BlockImageField
              variant="avatar"
              imageSrc={image ?? undefined}
              onFileChange={async file => {
                // Use the appropriate image property based on what's selected to be shown
                // Prefer cover if shown, otherwise use avatar
                const usePropertyId = showCover ? SystemIds.COVER_PROPERTY : ContentIds.AVATAR_PROPERTY;
                const usePropertyName = showCover ? 'Cover' : 'Avatar';

                // Use the consolidated helper to create and link the image
                await storage.images.createAndLink({
                  file,
                  fromEntityId: rowEntityId,
                  fromEntityName: name,
                  relationPropertyId: usePropertyId,
                  relationPropertyName: usePropertyName,
                  spaceId: currentSpaceId,
                });
              }}
            />
          )}
        </div>
        <div className="w-full space-y-3">
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
                autoFocus={autoFocus}
              />
            ) : (
              <>
                {source.type !== 'COLLECTION' ? (
                  <PageStringField
                    placeholder="Entity name..."
                    value={name ?? ''}
                    shouldDebounce={true}
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
                                entityId: nameValueId,
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
                    view="LIST"
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
          <div>
            <div className="text-metadata text-grey-04">Description</div>
            <PageStringField
              placeholder="Add description..."
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
                          attributeId: SystemIds.DESCRIPTION_PROPERTY,
                          entityId: descriptionValueId,
                          spaceId: currentSpaceId,
                          attributeName: 'Description',
                          entityName: name,
                          type: 'TEXT',
                          value: description ?? '',
                        },
                        value: { type: 'TEXT', value: value },
                      },
                    },
                  }
                );

                return;
              }}
              value={description ?? ''}
            />
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
                    entityName={name}
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
      className="group flex w-full max-w-full grow items-start justify-start gap-6 rounded-[17px] p-1 pr-5 transition duration-200 hover:bg-divider"
    >
      <div className="relative h-16 w-16 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
        {image ? (
          <GeoImage
            value={image}
            className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
            alt=""
            fill
          />
        ) : (
          <NextImage
            src={PLACEHOLDER_SPACE_IMAGE}
            className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
            alt=""
            fill
            sizes={DEFAULT_IMAGE_SIZES}
            loading="eager"
          />
        )}
      </div>
      <div className="w-full">
        {source.type !== 'COLLECTION' ? (
          <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
        ) : (
          <CollectionMetadata
            view="LIST"
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
            <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
          </CollectionMetadata>
        )}
        {description && <div className="line-clamp-4 text-metadata text-text md:line-clamp-3">{description}</div>}

        {otherPropertyData.map(p => {
          const property = properties?.[p.slotId];

          if (!property) {
            return null;
          }

          return (
            <div key={`${p.slotId}-${cellId}`}>
              <TableBlockPropertyField
                key={p.slotId}
                spaceId={currentSpaceId}
                entityId={cellId}
                property={property}
                onChangeEntry={onChangeEntry}
                source={source}
                disableLink={true}
                entityName={name}
              />
            </div>
          );
        })}
      </div>
    </Link>
  );
}
