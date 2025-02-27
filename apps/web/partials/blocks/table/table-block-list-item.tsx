import { CONTENT_IDS, Image, SYSTEM_IDS } from '@graphprotocol/grc-20';
import NextImage from 'next/image';
import Link from 'next/link';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { EditEvent, EditEventContext, editEvent } from '~/core/events/edit-events';
import { PropertyId } from '~/core/hooks/use-properties';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId } from '~/core/io/schema';
import { Cell, PropertySchema } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Divider } from '~/design-system/divider';
import { ListImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';

import { TableBlockPropertyField } from './table-block-property-field';

type ChangeEntryParams =
  | {
      type: 'EVENT';
      data: EditEvent;
    }
  | {
      type: 'FOC';
      data: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean };
    };

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  spaceId: string;
  isPlaceholder: boolean;
  onChangeEntry: (context: EditEventContext, event: ChangeEntryParams) => void;
  properties?: Record<PropertyId, PropertySchema>;
  // allowedTypes
};

export function TableBlockListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  spaceId,
  isPlaceholder,
  onChangeEntry,
  properties,
}: Props) {
  const nameCell = columns[SYSTEM_IDS.NAME_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[CONTENT_IDS.AVATAR_ATTRIBUTE];
  const maybeDescriptionData: Cell | undefined = columns[SYSTEM_IDS.DESCRIPTION_ATTRIBUTE];

  const { cellId, name, verified } = nameCell;
  let { description, image } = nameCell;

  const maybeDescription = maybeDescriptionData?.renderables.find(
    r => r.attributeId === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
  )?.value;

  if (maybeDescription) {
    description = maybeDescription;
  }

  const maybeAvatarUrl = maybeAvatarData?.renderables.find(r => r.attributeId === CONTENT_IDS.AVATAR_ATTRIBUTE)?.value;

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SYSTEM_IDS.NAME_ATTRIBUTE &&
      c.slotId !== CONTENT_IDS.AVATAR_ATTRIBUTE &&
      c.slotId !== SYSTEM_IDS.COVER_ATTRIBUTE &&
      c.slotId !== SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
  );

  if (isEditing) {
    return (
      <div className="group flex w-full max-w-full items-start justify-start gap-6 pr-6">
        <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-clip rounded-lg bg-grey-01">
          {image ? (
            <NextImage
              src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          ) : (
            <ListImageField
              imageSrc={image ?? undefined}
              onImageChange={imageSrc => {
                const { imageId, ops } = Image.make(imageSrc);
                const [createRelationOp, setTripleOp] = ops;

                const imageEntityDispatch = editEvent({
                  context: {
                    entityId: createRelationOp.relation.fromEntity,
                    entityName: null,
                    spaceId,
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

                imageEntityDispatch({
                  type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                  payload: {
                    renderable: {
                      attributeId: setTripleOp.triple.attribute,
                      entityId: imageId,
                      spaceId,
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
                    spaceId,
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
                        typeOfId: CONTENT_IDS.AVATAR_ATTRIBUTE,
                        typeOfName: 'Avatar',
                        renderableType: 'IMAGE',
                        value: setTripleOp.triple.value.value,
                      },
                    },
                  }
                );
              }}
            />
          )}
        </div>
        <div className="w-full space-y-4">
          <div>
            <div className="text-metadata text-grey-04">Name</div>
            {isPlaceholder ? (
              <SelectEntity
                // What actually happens here? We create a link to the entity for the source?
                // If the entity already exists then it should be a text block instead of the
                // search experience
                onDone={result => {
                  onChangeEntry(
                    {
                      entityId: rowEntityId,
                      entityName: name,
                      spaceId: currentSpaceId,
                    },
                    {
                      type: 'FOC',
                      data: result,
                    }
                  );
                }}
                onCreateEntity={result => {
                  // This actually works quite differently than other creates since
                  // we want to use the existing placeholder entity id.
                  onChangeEntry(
                    {
                      entityId: rowEntityId,
                      entityName: name,
                      spaceId: currentSpaceId,
                    },
                    {
                      type: 'FOC',
                      data: result,
                    }
                  );
                }}
                spaceId={currentSpaceId}
                allowedTypes={[]}
              />
            ) : (
              <PageStringField
                placeholder="Add name..."
                onChange={e => {
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
                            attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
                            entityId: rowEntityId,
                            spaceId: currentSpaceId,
                            attributeName: 'Name',
                            entityName: name,
                            type: 'TEXT',
                            value: name ?? '',
                          },
                          value: { type: 'TEXT', value: e.currentTarget.value },
                        },
                      },
                    }
                  );

                  return;
                }}
                value={name ?? ''}
              />
            )}
          </div>
          <Divider type="horizontal" style="dashed" />
          {/* @TODO: description should just be part of the otherPropertyData */}
          <div>
            <div className="text-metadata text-grey-04">Description</div>
            <PageStringField
              placeholder="Add description..."
              onChange={e => {
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
                          attributeId: SYSTEM_IDS.DESCRIPTION_ATTRIBUTE,
                          entityId: rowEntityId,
                          spaceId: currentSpaceId,
                          attributeName: 'Description',
                          entityName: name,
                          type: 'TEXT',
                          value: description ?? '',
                        },
                        value: { type: 'TEXT', value: e.currentTarget.value },
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
    <div>
      <Link href={href} className="group flex w-full max-w-full items-start justify-start gap-6 pr-6">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
          <NextImage
            src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
            className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
            alt=""
            fill
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            {verified && (
              <div>
                <CheckCircle />
              </div>
            )}
            <div className="line-clamp-1 text-smallTitle font-medium text-text md:line-clamp-2">{name}</div>
          </div>
          {description && (
            <div className="mt-0.5 line-clamp-4 text-metadata text-grey-04 md:line-clamp-3">{description}</div>
          )}

          {otherPropertyData.map(p => {
            return (
              <div key={`${p.slotId}-${cellId}`}>
                <Spacer height={12} />
                <TableBlockPropertyField
                  key={p.slotId}
                  renderables={p.renderables}
                  spaceId={currentSpaceId}
                  entityId={cellId}
                  properties={properties}
                />
              </div>
            );
          })}
        </div>
      </Link>
    </div>
  );
}
