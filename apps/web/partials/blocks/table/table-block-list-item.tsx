'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import cx from 'classnames';
import NextImage from 'next/image';

import { isScorePropertyShown } from '~/core/blocks/data/is-score-property-shown';
import { Source } from '~/core/blocks/data/source';
import { useView } from '~/core/blocks/data/use-view';
import { PLACEHOLDER_SPACE_IMAGE, SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { useMutate } from '~/core/sync/use-mutate';
import { useSpaceAwareRelation, useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
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
  focusRequestKey,
  collectionTypeFilters,
}: Props) {
  const { storage } = useMutate();
  const { shownColumnIds } = useView();
  const showVoteButtons = isScorePropertyShown(shownColumnIds);
  const nameCell = columns[SystemIds.NAME_PROPERTY];

  const { propertyId: cellId, verified } = nameCell;
  let { image } = nameCell;

  const name =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })
      ?.value ?? null;
  const descriptionValue = useSpaceAwareValue({
    entityId: rowEntityId,
    propertyId: SystemIds.DESCRIPTION_PROPERTY,
    spaceId: currentSpaceId,
  });
  const description = descriptionValue?.value ?? nameCell.description ?? null;

  const avatarRelation = useSpaceAwareRelation({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === rowEntityId,
    spaceId: currentSpaceId,
  });

  const maybeAvatarUrl = avatarRelation?.toEntity.value;

  const coverRelation = useSpaceAwareRelation({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === rowEntityId,
    spaceId: currentSpaceId,
  });

  const maybeCoverUrl = coverRelation?.toEntity.value;

  // Always show cover if available, then fall back to avatar.
  // This ensures images render even when cover/avatar aren't
  // configured as shown columns on the data block.
  image = maybeCoverUrl ?? maybeAvatarUrl ?? image;

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SystemIds.NAME_PROPERTY &&
      c.slotId !== ContentIds.AVATAR_PROPERTY &&
      c.slotId !== SystemIds.COVER_PROPERTY &&
      c.slotId !== SystemIds.DESCRIPTION_PROPERTY &&
      c.slotId !== SCORE_SYSTEM_PROPERTY
  );

  const imageUrl = useImageUrlFromEntity(image || undefined, currentSpaceId || '');
  if (image && imageUrl) {
    image = imageUrl;
  }

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full max-w-full items-start justify-start gap-6 p-1 pr-5">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-clip rounded-[0.625rem] bg-grey-01">
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
                // List items default to avatar for new uploads since
                // the small thumbnail is a natural fit for avatar images.
                await storage.images.createAndLink({
                  file,
                  fromEntityId: rowEntityId,
                  fromEntityName: name,
                  relationPropertyId: ContentIds.AVATAR_PROPERTY,
                  relationPropertyName: 'Avatar',
                  spaceId: currentSpaceId,
                });
              }}
            />
          )}
        </div>
        <div className="w-full min-w-0 space-y-3">
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
          <div>
            <div className="text-metadata text-grey-04">Description</div>
            <PageStringField
              variant="tableCell"
              placeholder="Add description..."
              onChange={value => {
                onChangeEntry(rowEntityId, currentSpaceId, {
                  type: 'SET_VALUE',
                  property: { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
                  value,
                });
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
    <div className="group flex w-full max-w-full items-start rounded-[17px] p-1 pr-5 transition duration-200 hover:bg-divider md:block md:pr-1">
      <div className="flex min-w-0 flex-1 items-start gap-6 pr-2 md:w-full md:pr-0">
        <Link
          entityId={rowEntityId}
          spaceId={currentSpaceId}
          href={href}
          className="relative block h-16 w-16 shrink-0 overflow-clip rounded-lg bg-grey-01"
        >
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
        </Link>
        <div className="w-full min-w-0">
          <div>
            {source.type !== 'COLLECTION' ? (
              <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href}>
                <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
              </Link>
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
                hideHoverActions
                openedWithMainViewEditing={isEditing}
              >
                <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href}>
                  <div className="text-smallTitle font-medium text-text">{name || rowEntityId}</div>
                </Link>
              </CollectionMetadata>
            )}
          </div>
          {description && (
            <div className={cx('mt-1 line-clamp-4 md:line-clamp-3', LIST_GALLERY_BROWSE_BODY_CLASS)}>{description}</div>
          )}

          {orderCellsForBrowseFigma(otherPropertyData, properties).map(p => {
            const property = properties?.[p.slotId];

            if (!property) {
              return null;
            }

            const isRelation = property.dataType === 'RELATION';

            return (
              <div key={`${p.slotId}-${rowEntityId}`} className={browseListStackMarginTopForField(isRelation)}>
                <TableBlockPropertyField
                  key={p.slotId}
                  spaceId={currentSpaceId}
                  entityId={rowEntityId}
                  property={property}
                  onChangeEntry={onChangeEntry}
                  source={source}
                  entityName={name}
                  browseListBody
                />
              </div>
            );
          })}
          <div className="mt-2 flex items-center justify-between gap-2">
            {showVoteButtons ? <EntityVoteButtons entityId={rowEntityId} spaceId={currentSpaceId} /> : null}
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
    </div>
  );
}
