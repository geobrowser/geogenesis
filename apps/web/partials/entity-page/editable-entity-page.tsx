'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Image } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import * as React from 'react';

import { DB } from '~/core/database/write';
import { useEditEvents } from '~/core/events/edit-events';
import { usePropertyValueTypes } from '~/core/hooks/use-property-value-types';
import { useRenderables } from '~/core/hooks/use-renderables';
import { EntityId } from '~/core/io/schema';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import {
  PropertySchema,
  Relation,
  RelationRenderableProperty,
  RenderableProperty,
  TripleRenderableProperty,
} from '~/core/types';
import { Triple as ITriple } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { EntityTextAutocomplete } from '~/design-system/autocomplete/entity-text-autocomplete';
import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { getRenderableTypeSelectorOptions } from './get-renderable-type-options';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  relationsOut: Relation[];
}

export function EditableEntityPage({ id, spaceId, triples: serverTriples }: Props) {
  const { renderablesGroupedByAttributeId, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    useRenderables(serverTriples, spaceId);
  const { name } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const { propertyValueTypes } = usePropertyValueTypes(Object.keys(renderablesGroupedByAttributeId));

  return (
    <>
      <div className="rounded-lg border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          {Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
            // Triple groups only ever have one renderable
            const firstRenderable = renderables[0];
            const renderableType = firstRenderable.type;

            // @TODO: We can abstract this away. We also don't need to pass in the first renderable to options func.
            const selectorOptions = getRenderableTypeSelectorOptions(
              firstRenderable,
              placeholderRenderable => {
                if (!firstRenderable.placeholder) {
                  send({ type: 'DELETE_RENDERABLE', payload: { renderable: firstRenderable } });
                }
                addPlaceholderRenderable(placeholderRenderable);
              },
              send
            );

            return (
              <div key={`${id}-${attributeId}`} className="relative break-words">
                <EditableAttribute
                  renderable={firstRenderable}
                  onChange={() => {
                    // If we create a placeholder using the + button the placeholder gets an empty
                    // attribute id. If we then add an attribute the placeholder won't get removed
                    // because the placeholder attribute id is different than the new attribute id.
                    //
                    // Here we manually remove the placeholder when the attribute is changed. This is
                    // a bit of different control flow from how we handle other placeholders, but it's
                    // only necessary on entity pages.
                    if (firstRenderable.placeholder === true && firstRenderable.attributeId === '') {
                      removeEmptyPlaceholderRenderable(firstRenderable);
                    }
                  }}
                />
                {renderableType === 'RELATION' || renderableType === 'IMAGE' ? (
                  <RelationsGroup
                    key={attributeId}
                    relations={renderables as RelationRenderableProperty[]}
                    propertyValueTypes={propertyValueTypes}
                  />
                ) : (
                  <TriplesGroup
                    key={attributeId}
                    triples={renderables as TripleRenderableProperty[]}
                    propertyValueTypes={propertyValueTypes}
                  />
                )}

                <div className="absolute right-0 top-6 flex items-center gap-1">
                  {/* Entity renderables only exist on Relation entities and are not changeable to another renderable type */}
                  <>
                    <RenderableTypeDropdown value={renderableType} options={selectorOptions} />

                    {/* Relation renderable types don't render the delete button. Instead you delete each individual relation */}
                    {renderableType !== 'RELATION' && (
                      <SquareButton
                        icon={<Trash />}
                        onClick={() => {
                          send({ type: 'DELETE_RENDERABLE', payload: { renderable: firstRenderable } });
                        }}
                      />
                    )}
                  </>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4">
          <SquareButton
            onClick={() => {
              addPlaceholderRenderable({
                type: 'TEXT',
                entityId: id,
                entityName: name ?? '',
                attributeId: '',
                attributeName: null,
                value: '',
                spaceId,
                placeholder: true,
              });
            }}
            icon={<Create />}
          />
        </div>
      </div>
    </>
  );
}

function EditableAttribute({ renderable, onChange }: { renderable: RenderableProperty; onChange: () => void }) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  if (renderable.attributeId === '') {
    return (
      <EntityTextAutocomplete
        spaceId={spaceId}
        placeholder="Add attribute..."
        onDone={result => {
          onChange();
          send({
            type: 'UPSERT_ATTRIBUTE',
            payload: { renderable, attributeId: result.id, attributeName: result.name },
          });
        }}
        filterByTypes={[{ typeId: SYSTEM_IDS.ATTRIBUTE, typeName: 'Attribute' }]}
        alreadySelectedIds={[]}
        attributeId={renderable.attributeId}
      />
    );
  }

  return (
    <Link href={NavUtils.toEntity(spaceId, renderable.attributeId)}>
      <Text as="p" variant="bodySemibold">
        {renderable.attributeName ?? renderable.attributeId}
      </Text>
    </Link>
  );
}

type RelationsGroupProps = {
  relations: RelationRenderableProperty[];
  propertyValueTypes: Map<string, PropertySchema>;
};

function RelationsGroup({ relations, propertyValueTypes }: RelationsGroupProps) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const hasPlaceholders = relations.some(r => r.placeholder === true);
  const typeOfId = relations[0].attributeId;
  const typeOfName = relations[0].attributeName;
  const typeOfRenderableType = relations[0].type;
  const propertyValueType = propertyValueTypes.get(typeOfId);
  const filterByType = propertyValueType?.relationValueTypeId;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {relations.map(r => {
        const relationId = r.relationId;
        const relationName = r.valueName;
        const renderableType = r.type;
        const relationValue = r.value;

        if (renderableType === 'IMAGE' && r.placeholder === true) {
          return (
            <div key={`relation-upload-image-${relationId}`}>
              <PageImageField
                onImageChange={imageSrc => {
                  const { imageId, ops } = Image.make(imageSrc);
                  const [createRelationOp, setTripleOp] = ops;

                  send({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: createRelationOp.relation.fromEntity,
                      toEntityId: createRelationOp.relation.toEntity,
                      toEntityName: null,
                      typeOfId: createRelationOp.relation.type,
                      typeOfName: 'Types',
                    },
                  });

                  DB.upsert(
                    {
                      value: {
                        type: 'URL',
                        value: setTripleOp.triple.value.value,
                      },
                      entityId: imageId,
                      attributeId: setTripleOp.triple.attribute,
                      entityName: null,
                      attributeName: 'Image URL',
                    },
                    spaceId
                  );

                  send({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: id,
                      toEntityId: imageId,
                      toEntityName: null,
                      typeOfId: r.attributeId,
                      typeOfName: r.attributeName,
                      renderableType: 'IMAGE',
                      value: setTripleOp.triple.value.value,
                    },
                  });
                }}
                onImageRemove={() => console.log(`remove`)}
              />
            </div>
          );
        }

        if (renderableType === 'IMAGE') {
          return <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={getImagePath(relationValue)} />;
        }

        if (renderableType === 'RELATION' && r.placeholder === true) {
          return (
            <div key={`relation-select-entity-${relationId}`} data-testid="select-entity" className="w-full">
              <SelectEntity
                spaceId={spaceId}
                allowedTypes={filterByType ? [filterByType] : undefined}
                onCreateEntity={result => {
                  if (propertyValueType?.relationValueTypeId) {
                    createTypesForEntity({
                      entityId: result.id,
                      entityName: result.name,
                      spaceId,
                      typeId: propertyValueType.relationValueTypeId,
                      typeName: propertyValueType.relationValueTypeName ?? null,
                    });
                  }
                }}
                onDone={result => {
                  send({
                    type: 'UPSERT_RELATION',
                    payload: {
                      fromEntityId: id,
                      toEntityId: result.id,
                      toEntityName: result.name,
                      typeOfId: r.attributeId,
                      typeOfName: r.attributeName,
                    },
                  });
                }}
                variant="fixed"
              />
            </div>
          );
        }

        return (
          <div key={`relation-${relationId}-${relationValue}`} className="mt-1">
            <LinkableRelationChip
              isEditing
              onDelete={() => {
                send({
                  type: 'DELETE_RELATION',
                  payload: {
                    relationId: r.relationId,
                  },
                });
              }}
              entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
              relationHref={NavUtils.toEntity(spaceId, relationId)}
            >
              {relationName ?? relationValue}
            </LinkableRelationChip>
          </div>
        );
      })}
      {!hasPlaceholders && typeOfRenderableType === 'RELATION' && (
        <div className="mt-1">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            allowedTypes={filterByType ? [filterByType] : undefined}
            onCreateEntity={result => {
              if (propertyValueType?.relationValueTypeId) {
                createTypesForEntity({
                  entityId: result.id,
                  entityName: result.name,
                  spaceId,
                  typeId: propertyValueType.relationValueTypeId,
                  typeName: propertyValueType.relationValueTypeName ?? null,
                });
              }
            }}
            onDone={result => {
              send({
                type: 'UPSERT_RELATION',
                payload: {
                  fromEntityId: id,
                  toEntityId: result.id,
                  toEntityName: result.name,
                  typeOfId: typeOfId,
                  typeOfName: typeOfName,
                },
              });
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

type CreateTypesForEntityArgs = {
  entityId: string;
  entityName: string | null;
  spaceId: string;
  typeId: string;
  typeName: string | null;
};

function createTypesForEntity(args: CreateTypesForEntityArgs) {
  const { entityId, entityName, spaceId, typeId, typeName } = args;
  DB.upsertRelation({
    spaceId,
    relation: {
      space: spaceId,
      index: INITIAL_RELATION_INDEX_VALUE,
      fromEntity: {
        id: EntityId(entityId),
        name: entityName,
      },
      typeOf: {
        id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
        name: 'Types',
      },
      toEntity: {
        id: EntityId(typeId),
        name: typeName,
        renderableType: 'RELATION',
        value: typeId,
      },
    },
  });
}

type TriplesGroupProps = {
  triples: TripleRenderableProperty[];
  propertyValueTypes: Map<string, PropertySchema>;
};

function TriplesGroup({ triples }: TriplesGroupProps) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId: spaceId,
      entityName: name ?? '',
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      {triples.map(renderable => {
        switch (renderable.type) {
          case 'TEXT': {
            return (
              <PageStringField
                key={renderable.attributeId}
                variant="body"
                placeholder="Add value..."
                aria-label="text-field"
                value={renderable.value}
                onChange={e => {
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'TEXT',
                        value: e.target.value,
                      },
                    },
                  });
                }}
              />
            );
          }
          case 'NUMBER':
            return (
              <NumberField
                value={renderable.value}
                onChange={value =>
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'NUMBER',
                        value: value,
                      },
                    },
                  })
                }
              />
            );
          case 'CHECKBOX': {
            const checked = getChecked(renderable.value);

            return (
              <Checkbox
                key={`checkbox-${renderable.attributeId}-${renderable.value}`}
                checked={checked}
                onChange={() => {
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'CHECKBOX',
                        value: !checked ? '1' : '0',
                      },
                    },
                  });
                }}
              />
            );
          }
          case 'TIME': {
            return (
              <DateField
                onBlur={time =>
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      value: {
                        value: time,
                        type: 'TIME',
                      },
                      renderable,
                    },
                  })
                }
                key={renderable.attributeId}
                isEditing={true}
                value={renderable.value}
              />
            );
          }

          case 'URL': {
            return (
              <WebUrlField
                key={renderable.attributeId}
                placeholder="Add a URI"
                isEditing={true}
                onBlur={event =>
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      value: {
                        value: event.target.value,
                        type: 'URL',
                      },
                      renderable,
                    },
                  })
                }
                value={renderable.value}
              />
            );
          }
        }
      })}
    </div>
  );
}
