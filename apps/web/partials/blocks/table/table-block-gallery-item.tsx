'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import NextImage from 'next/image';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelation, useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { DEFAULT_IMAGE_SIZES, GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { EditModeNameField } from '~/partials/blocks/table/edit-mode-name-field';

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
  autoFocus?: boolean;
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
  autoFocus = false,
}: Props) {
  const { storage } = useMutate();
  const nameCell: Cell | undefined = columns[SystemIds.NAME_PROPERTY];

  const { propertyId: cellId, verified } = nameCell;
  let { image } = nameCell;

  const name =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })
      ?.value ?? null;
  const description =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.DESCRIPTION_PROPERTY, spaceId: currentSpaceId })
      ?.value ??
    nameCell.description ??
    null;

  const avatarRelation = useRelation({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeAvatarUrl = avatarRelation?.toEntity.value;

  const coverRelation = useRelation({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === rowEntityId,
  });

  const maybeCoverUrl = coverRelation?.toEntity.value;

  // Always show cover if available, then fall back to avatar.
  // This ensures images render even when cover/avatar aren't
  // configured as shown columns on the data block.
  image = maybeCoverUrl ?? maybeAvatarUrl ?? image;

  const imageUrl = useImageUrlFromEntity(image || undefined, currentSpaceId || '');
  if (image && imageUrl) {
    image = imageUrl;
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
        <div className="relative flex aspect-2/1 w-full items-center justify-center overflow-clip rounded-lg bg-grey-01">
          {image ? (
            <GeoImage
              value={image}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          ) : (
            <BlockImageField
              variant="gallery"
              imageSrc={image ?? undefined}
              onFileChange={async file => {
                // Gallery items default to cover for new uploads since
                // the large image area is a natural fit for cover images.
                await storage.images.createAndLink({
                  file,
                  fromEntityId: rowEntityId,
                  fromEntityName: name,
                  relationPropertyId: SystemIds.COVER_PROPERTY,
                  relationPropertyName: 'Cover',
                  spaceId: currentSpaceId,
                });
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
                  onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
                  return rowEntityId;
                }}
                onDone={(result, fromCreateFn) => {
                  if (fromCreateFn) return;
                  onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
                }}
                spaceId={currentSpaceId}
                autoFocus={autoFocus}
              />
            ) : (
              <>
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
                        onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
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
      className="group flex flex-col gap-3 rounded-[17px] p-[5px] py-2 transition duration-200 hover:bg-divider"
    >
      <div className="relative aspect-2/1 w-full overflow-clip rounded-lg bg-grey-01">
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
      <div className="flex w-full flex-col px-1">
        <div className="flex flex-col gap-2">
          {source.type !== 'COLLECTION' ? (
            <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
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
              <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
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
                entityName={name}
              />
            );
          })}
      </div>
    </Link>
  );
}
