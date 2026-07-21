'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import cx from 'classnames';
import NextImage from 'next/image';

import { isBlockMediaColumn } from '~/core/blocks/data/resolve-main-media-property';
import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useBlockMainMediaUrl } from '~/core/hooks/use-block-main-media';
import { type BlockMainMedia, blockMainMediaDimensions } from '~/core/hooks/use-block-main-media-property';
import { blockMediaFrame } from '~/core/hooks/use-block-media-dimensions';
import { useMutate } from '~/core/sync/use-mutate';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { DEFAULT_IMAGE_SIZES, GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { CollectionRowActions } from '~/partials/blocks/table/collection-row-actions';
import { DataBlockOpenSidePanelButton } from '~/partials/blocks/table/data-block-open-side-panel-button';
import { EditModeNameField } from '~/partials/blocks/table/edit-mode-name-field';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import {
  LIST_GALLERY_BROWSE_BODY_CLASS,
  browseListStackMarginTopForField,
  orderCellsForBrowseFigma,
} from './table-block-browse-layout';
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
  mainMedia?: BlockMainMedia | null;
  relationId?: string;
  source: Source;
  autoFocus?: boolean;
  focusRequestKey?: number;
  collectionTypeFilters?: { id: string; name: string | null }[];
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
  mainMedia,
  relationId,
  source,
  autoFocus = false,
  focusRequestKey,
  collectionTypeFilters,
}: Props) {
  const { storage } = useMutate();
  const nameCell: Cell | undefined = columns[SystemIds.NAME_PROPERTY];

  const { propertyId: cellId, verified } = nameCell;
  const nameCellImageHint = nameCell?.image ?? null;

  const name =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })
      ?.value ?? null;
  const description =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.DESCRIPTION_PROPERTY, spaceId: currentSpaceId })
      ?.value ??
    nameCell.description ??
    null;

  const image = useBlockMainMediaUrl({
    entityId: rowEntityId,
    spaceId: currentSpaceId,
    mediaPropertyId: mainMedia?.propertyId ?? null,
    mediaKind: mainMedia?.kind,
    fallbackHint: nameCellImageHint,
  });

  const imageUploadProperty =
    mainMedia && mainMedia.kind === 'IMAGE'
      ? { id: mainMedia.propertyId, name: mainMedia.name ?? 'Image' }
      : { id: SystemIds.COVER_PROPERTY, name: 'Cover' };

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(c => {
    if (c.slotId === SystemIds.NAME_PROPERTY) return false;
    if (isBlockMediaColumn(c.slotId, properties)) return false;
    return true;
  });

  /**
   * We render descriptions in a specific style, but want to treat whether to render the description
   * at all the same way we treat any toggleable field.
   *
   * To do this we read description data from the row like every other optional data, but filter it
   * out of rendering at read-time. Then we can render it it's unique way.
   */
  const propertyDataHasDescription = otherPropertyData.some(c => c.slotId === SystemIds.DESCRIPTION_PROPERTY);

  const mediaFrame = blockMediaFrame(blockMainMediaDimensions(mainMedia));
  const mediaFrameClassName = cx(
    'relative w-full overflow-clip rounded-lg bg-grey-01',
    !mediaFrame.hasCustomHeight && 'aspect-2/1'
  );
  const mediaFrameStyle = mediaFrame.style;

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex flex-col gap-3 rounded-[17px] p-1 pb-2">
        <div className={cx(mediaFrameClassName, 'flex items-center justify-center')} style={mediaFrameStyle}>
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
                await storage.images.createAndLink({
                  file,
                  fromEntityId: rowEntityId,
                  fromEntityName: name,
                  relationPropertyId: imageUploadProperty.id,
                  relationPropertyName: imageUploadProperty.name,
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
                focusRequestKey={focusRequestKey}
                relationValueTypes={collectionTypeFilters}
              />
            ) : (
              <>
                {source.type !== 'COLLECTION' ? (
                  <EditModeNameField
                    name={name}
                    entityId={rowEntityId}
                    spaceId={currentSpaceId}
                    entitySpaceIdForPanel={nameCell?.space ?? currentSpaceId}
                    openedWithMainViewEditing={isEditing}
                    hideHoverActions
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
                    showSidePanel={!isPlaceholder}
                    openedWithMainViewEditing={isEditing}
                    hideHoverActions
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

          {/* Bottom actions row like browse mode, minus votes — voting is browse-only.
              Side panel / relation actions sit bottom-right on hover. */}
          {!isPlaceholder && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <div className="invisible flex items-center opacity-0 transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:hidden [&_button]:h-5 [&_button]:w-5">
                {source.type === 'COLLECTION' ? (
                  <CollectionRowActions
                    isEditing={true}
                    currentSpaceId={currentSpaceId}
                    entityId={rowEntityId}
                    spaceId={nameCell?.space}
                    relationId={relationId}
                    verified={verified}
                    onLinkEntry={onLinkEntry}
                    openedWithMainViewEditing={isEditing}
                  />
                ) : (
                  <DataBlockOpenSidePanelButton
                    entityId={rowEntityId}
                    entitySpaceId={nameCell?.space ?? currentSpaceId}
                    openedWithMainViewEditing={isEditing}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-3 rounded-[17px] p-1 pb-2 transition duration-200 hover:bg-grey-01">
      <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href}>
        <div className={mediaFrameClassName} style={mediaFrameStyle}>
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
      </Link>
      <div className="flex w-full flex-col px-1">
        <div className="min-w-0">
          {source.type !== 'COLLECTION' ? (
            <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href}>
              <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
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
              hideHoverActions
              openedWithMainViewEditing={isEditing}
            >
              <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href}>
                <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
              </Link>
            </CollectionMetadata>
          )}
        </div>
        {description && propertyDataHasDescription && (
          <div className={cx('mt-1 line-clamp-4 md:line-clamp-3', LIST_GALLERY_BROWSE_BODY_CLASS)}>{description}</div>
        )}

        {orderCellsForBrowseFigma(
          otherPropertyData.filter(p => p.slotId !== SystemIds.DESCRIPTION_PROPERTY),
          properties
        ).map(p => {
          const property = properties?.[p.slotId];

          if (!property) {
            return null;
          }

          const isRelation = property.dataType === 'RELATION';

          return (
            <div key={p.slotId} className={browseListStackMarginTopForField(isRelation)}>
              <TableBlockPropertyField
                property={property}
                spaceId={currentSpaceId}
                entityId={rowEntityId}
                onChangeEntry={onChangeEntry}
                source={source}
                entityName={name}
                browseListBody
              />
            </div>
          );
        })}
        <div className="mt-2 flex items-center justify-between gap-2">
          <EntityVoteButtons entityId={rowEntityId} spaceId={currentSpaceId} />
          {!isPlaceholder && (
            <div className="invisible flex items-center opacity-0 transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:hidden [&_button]:h-5 [&_button]:w-5">
              {source.type === 'COLLECTION' ? (
                <CollectionRowActions
                  isEditing={false}
                  currentSpaceId={currentSpaceId}
                  entityId={rowEntityId}
                  spaceId={nameCell?.space}
                  relationId={relationId}
                  verified={verified}
                  onLinkEntry={onLinkEntry}
                  openedWithMainViewEditing={isEditing}
                />
              ) : (
                <DataBlockOpenSidePanelButton
                  entityId={rowEntityId}
                  entitySpaceId={nameCell?.space ?? currentSpaceId}
                  openedWithMainViewEditing={isEditing}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
