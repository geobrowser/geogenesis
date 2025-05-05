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
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { getName } from '~/partials/blocks/table/utils';

import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  isPlaceholder: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<PropertyId, PropertySchema>;
  relationId?: string;
  source: Source;
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
}: Props) {
  const nameCell = columns[SystemIds.NAME_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[ContentIds.AVATAR_ATTRIBUTE];
  const maybeDescriptionData: Cell | undefined = columns[SystemIds.DESCRIPTION_ATTRIBUTE];

  const { cellId, verified } = nameCell;
  let { description, image } = nameCell;

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

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SystemIds.NAME_ATTRIBUTE &&
      c.slotId !== ContentIds.AVATAR_ATTRIBUTE &&
      c.slotId !== SystemIds.COVER_ATTRIBUTE &&
      c.slotId !== SystemIds.DESCRIPTION_ATTRIBUTE
  );

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full max-w-full items-start justify-start gap-6 p-1 pr-5">
        <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-clip rounded-lg bg-grey-01">
          {image ? (
            <NextImage
              src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          ) : (
            <BlockImageField
              variant="avatar"
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
        <div className="w-full space-y-4">
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
                ) : (
                  <CollectionMetadata
                    view="LIST"
                    isEditing={true}
                    name={name}
                    href={href}
                    currentSpaceId={currentSpaceId}
                    entityId={rowEntityId}
                    spaceId={nameCell?.space}
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
          <Divider type="horizontal" style="dashed" />
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
                          attributeId: SystemIds.DESCRIPTION_ATTRIBUTE,
                          entityId: rowEntityId,
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
      className="group flex w-full max-w-full grow items-start justify-start gap-6 rounded-[17px] p-1 pr-5 transition duration-200 hover:bg-divider"
    >
      <div className="relative h-16 w-16 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
        <NextImage
          src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
          className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
          alt=""
          fill
        />
      </div>
      <div className="w-full">
        {source.type !== 'COLLECTION' ? (
          <Link href={href} className="text-smallTitle font-medium text-text">
            {name || rowEntityId}
          </Link>
        ) : (
          <CollectionMetadata
            view="LIST"
            isEditing={false}
            name={name}
            href={href}
            currentSpaceId={currentSpaceId}
            entityId={rowEntityId}
            spaceId={nameCell?.space}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
          >
            <Link href={href} className="text-smallTitle font-medium text-text">
              {name || rowEntityId}
            </Link>
          </CollectionMetadata>
        )}
        {description && (
          <div className="mt-0.5 line-clamp-4 text-metadata text-grey-04 md:line-clamp-3">{description}</div>
        )}

        {otherPropertyData.map(p => {
          return (
            <div key={`${p.slotId}-${cellId}`}>
              <Spacer height={12} />
              <TableBlockPropertyField
                key={p.slotId}
                renderables={p.renderables.filter(r => Boolean(r.placeholder) === false)}
                spaceId={currentSpaceId}
                entityId={cellId}
                properties={properties}
                onChangeEntry={onChangeEntry}
                source={source}
              />
            </div>
          );
        })}
      </div>
    </Link>
  );
}
