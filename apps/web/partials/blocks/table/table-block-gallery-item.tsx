import { ContentIds, Image, SystemIds } from '@graphprotocol/grc-20';
import NextImage from 'next/image';
import Link from 'next/link';

import { Source } from '~/core/blocks/data/source';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { editEvent } from '~/core/events/edit-events';
import { PropertyId } from '~/core/hooks/use-properties';
import { Cell, PropertySchema } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Divider } from '~/design-system/divider';
import { BlockImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { SelectEntity } from '~/design-system/select-entity';

import { onChangeEntryFn } from './change-entry';
import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  onChangeEntry: onChangeEntryFn;
  isPlaceholder: boolean;
  properties?: Record<PropertyId, PropertySchema>;
  source: Source;
};

export function TableBlockGalleryItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  onChangeEntry,
  isPlaceholder,
  properties,
  source,
}: Props) {
  const nameCell: Cell | undefined = columns[SystemIds.NAME_ATTRIBUTE];
  const maybeDescriptionData: Cell | undefined = columns[SystemIds.DESCRIPTION_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[ContentIds.AVATAR_ATTRIBUTE];
  const maybeCoverData: Cell | undefined = columns[SystemIds.COVER_ATTRIBUTE];

  const { cellId, verified } = nameCell;
  let { image, name, description } = nameCell;

  const maybeNameInSpaceRenderable = nameCell.renderables.find(
    r => r.attributeId === SystemIds.NAME_ATTRIBUTE && r.spaceId === currentSpaceId
  );

  let maybeNameInSpace = maybeNameInSpaceRenderable?.value;

  if (maybeNameInSpaceRenderable?.type === 'RELATION') {
    maybeNameInSpace = maybeNameInSpaceRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeNameRenderable = nameCell?.renderables.find(r => r.attributeId === SystemIds.NAME_ATTRIBUTE);

  let maybeOtherName = maybeNameRenderable?.value;

  if (maybeNameRenderable?.type === 'RELATION') {
    maybeOtherName = maybeNameRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeName = maybeNameInSpace ?? maybeOtherName;

  if (maybeName) {
    name = maybeOtherName ?? null;
  }

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
              <div className="flex items-center gap-2">
                {verified && (
                  <span>
                    <CheckCircle color={isEditing ? 'text' : 'ctaPrimary'} />
                  </span>
                )}
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

                    return;
                  }}
                  value={name ?? ''}
                />
              </div>
            )}
          </div>

          {otherPropertyData.map(p => {
            return (
              <>
                <Divider type="horizontal" style="dashed" />
                <div key={p.slotId}>
                  <TableBlockPropertyField
                    key={p.slotId}
                    renderables={p.renderables}
                    spaceId={currentSpaceId}
                    entityId={rowEntityId}
                    properties={properties}
                    onChangeEntry={onChangeEntry}
                    source={source}
                  />
                </div>
              </>
            );
          })}
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
      <div className="flex flex-col gap-4 px-1">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {verified && (
              <div>
                <CheckCircle />
              </div>
            )}
            <div className="truncate text-smallTitle font-medium text-text">{name}</div>
          </div>
          {description && propertyDataHasDescription && (
            <div className="line-clamp-4 text-metadata text-grey-04 md:line-clamp-3">{description}</div>
          )}
        </div>

        {otherPropertyData
          .filter(p => p.slotId !== SystemIds.DESCRIPTION_PROPERTY)
          .map(p => {
            return (
              <TableBlockPropertyField
                key={p.slotId}
                renderables={p.renderables.filter(r => Boolean(r.placeholder) === false)}
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
