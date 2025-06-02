'use client';

import { ContentIds, GraphUrl, SystemIds } from '@graphprotocol/grc-20';
import { Image } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import { useAtom } from 'jotai';

import * as React from 'react';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { useEditEvents } from '~/core/events/edit-events';
import { useGeoCoordinates } from '~/core/hooks/use-geo-coordinates';
import { useProperties } from '~/core/hooks/use-properties';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import {
  PropertySchema,
  Relation,
  RelationRenderableProperty,
  RenderableProperty,
  TripleRenderableProperty,
} from '~/core/types';
import { Triple as ITriple } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationPointFields } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { InputPlace } from '~/design-system/input-address';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { DateFormatDropdown } from './date-format-dropdown';
import { getRenderableTypeSelectorOptions } from './get-renderable-type-options';
import { NumberOptionsDropdown } from './number-options-dropdown';
import { RenderableTypeDropdown } from './renderable-type-dropdown';
import { editorHasContentAtom } from '~/atoms';
import { VENUE_PROPERTY } from '~/core/system-ids';

interface Props {
  triples: ITriple[];
  id: string;
  spaceId: string;
  relationsOut: Relation[];
}

export function EditableEntityPage({ id, spaceId, triples: serverTriples, relationsOut }: Props) {
  const entityId = id;

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    useRenderables(serverTriples, spaceId, isRelationPage);
  const { name, relations, types } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId,
      spaceId,
      entityName: name ?? '',
    },
  });

  const coverUrl = Entities.cover(relations);
  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));
  const { blockIds } = useEditorStore();
  // Use the shared atom directly to get the latest value
  const [editorHasContent] = useAtom(editorHasContentAtom);

  // Show the properties panel when:
  // 1. Name exists, OR
  // 2. Cover/avatar exists, OR
  // 3. Types exist, OR
  // 4. Editor has content / blocks exist
  const showPropertiesPanel =
    (name && name?.length > 0) || coverUrl || types.length > 0 || (blockIds && blockIds.length > 0) || editorHasContent;

  return (
    showPropertiesPanel && (
      <>
        <div className="rounded-lg border border-grey-02 shadow-button">
          <div className="flex flex-col gap-6 p-5">
            {Object.entries(renderablesGroupedByAttributeId).length === 0 && (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Text as="p" variant="body" color="grey-04">
                  No properties added yet
                </Text>
                <Text as="p" variant="footnote" color="grey-03" className="mt-1">
                  Click the + button below to add properties
                </Text>
              </div>
            )}
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

              // Hide cover/avatar/types/name property, user can upload cover using upload icon on top placeholder
              // and add types inline using the + button, add name under cover image component
              if (
                (renderableType === 'IMAGE' && firstRenderable.attributeId === SystemIds.COVER_PROPERTY) ||
                (renderableType === 'IMAGE' && firstRenderable.attributeId === ContentIds.AVATAR_PROPERTY) ||
                (renderableType === 'RELATION' && firstRenderable.attributeId === SystemIds.TYPES_PROPERTY) ||
                (renderableType === 'TEXT' && firstRenderable.attributeId === SystemIds.NAME_PROPERTY)
              ) {
                return null;
              }

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
                  {renderableType === 'RELATION' || renderableType === 'IMAGE' || renderableType === 'PLACE' ? (
                    <RelationsGroup
                      key={attributeId}
                      relations={renderables as RelationRenderableProperty[]}
                      properties={properties}
                    />
                  ) : (
                    <TriplesGroup key={attributeId} triples={renderables as TripleRenderableProperty[]} />
                  )}
                  {/* We need to pin to top for Geo Location to prevent covering the display toggle */}
                  <div
                    className={`absolute right-0 flex items-center gap-1 ${firstRenderable.attributeId === SystemIds.GEO_LOCATION_PROPERTY && renderableType === 'POINT' ? 'top-0' : 'top-6'}`}
                  >
                    {/* Entity renderables only exist on Relation entities and are not changeable to another renderable type */}
                    <>
                      {renderableType === 'TIME' && (
                        <DateFormatDropdown
                          value={firstRenderable.value}
                          format={firstRenderable.options?.format}
                          onSelect={(value?: string, format?: string) => {
                            send({
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable: firstRenderable,
                                value: {
                                  value: value ?? firstRenderable.value,
                                  type: 'TIME',
                                  options: {
                                    format,
                                  },
                                },
                              },
                            });
                          }}
                        />
                      )}
                      {renderableType === 'NUMBER' && (
                        <NumberOptionsDropdown
                          value={firstRenderable.value}
                          format={firstRenderable.options?.format}
                          unitId={firstRenderable.options?.unit}
                          send={({ format, unitId }) => {
                            send({
                              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                              payload: {
                                renderable: firstRenderable,
                                value: {
                                  value: firstRenderable.value,
                                  type: 'NUMBER',
                                  options: {
                                    format,
                                    unit: unitId,
                                  },
                                },
                              },
                            });
                          }}
                        />
                      )}
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
    )
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
      <>
        <SelectEntity
          placeholder="Add property..."
          spaceId={spaceId}
          relationValueTypes={[{ typeId: SystemIds.PROPERTY, typeName: 'Property' }]}
          onCreateEntity={result => {
            send({
              type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
              payload: {
                renderable: {
                  attributeId: SystemIds.NAME_ATTRIBUTE,
                  entityId: result.id,
                  spaceId,
                  attributeName: 'Name',
                  entityName: result.name,
                  type: 'TEXT',
                  value: result.name ?? '',
                },
                value: { type: 'TEXT', value: result.name ?? '' },
              },
            });
            send({
              type: 'UPSERT_RELATION',
              payload: {
                fromEntityId: result.id,
                fromEntityName: result.name,
                toEntityId: SystemIds.PROPERTY,
                toEntityName: 'Property',
                typeOfId: SystemIds.TYPES_ATTRIBUTE,
                typeOfName: 'Types',
              },
            });
          }}
          onDone={result => {
            onChange();
            send({
              type: 'UPSERT_ATTRIBUTE',
              payload: { renderable, attributeId: result.id, attributeName: result.name },
            });
          }}
          withSelectSpace={false}
          advanced={false}
        />
      </>
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
  properties?: Record<string, PropertySchema>;
};

export function RelationsGroup({ relations, properties }: RelationsGroupProps) {
  const { id, name, spaceId } = useEntityPageStore();

  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const typeOfId = relations[0].attributeId;
  const typeOfName = relations[0].attributeName;
  const typeOfRenderableType = relations[0].type;
  const property = properties?.[typeOfId];
  const relationValueTypes = property?.relationValueTypes;
  const hasPlaceholders = relations.some(r => r.placeholder === true);
  const valueType = relationValueTypes?.[0];

  const geoData = useGeoCoordinates(id, spaceId);

  return (
    <div className="flex flex-wrap items-center gap-1 pr-10">
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
                  const { id: imageId, ops } = Image.make({ cid: imageSrc });
                  const [createRelationOp, setTripleOp] = ops;

                  if (createRelationOp.type === 'CREATE_RELATION') {
                    send({
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
                  }

                  if (setTripleOp.type === 'SET_TRIPLE') {
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
                        fromEntityName: name,
                        toEntityId: imageId,
                        toEntityName: null,
                        typeOfId: r.attributeId,
                        typeOfName: r.attributeName,
                        renderableType: 'IMAGE',
                        value: setTripleOp.triple.value.value,
                      },
                    });
                  }
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
          if (r.attributeName === 'Types') {
            return (
              <div key={`relation-select-entity-${relationId}`} data-testid="select-entity">
                <SelectEntityAsPopover
                  key={JSON.stringify(relationValueTypes)}
                  trigger={<AddTypeButton icon={<Create className="h-3 w-3" color="grey-04" />} label="type" />}
                  spaceId={spaceId}
                  relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
                  // placeholder="+ type"
                  onCreateEntity={result => {
                    if (property?.relationValueTypeId) {
                      send({
                        type: 'UPSERT_RELATION',
                        payload: {
                          fromEntityId: result.id,
                          fromEntityName: result.name,
                          toEntityId: property.relationValueTypeId,
                          toEntityName: property.relationValueTypeName ?? null,
                          typeOfId: SystemIds.TYPES_ATTRIBUTE,
                          typeOfName: 'Types',
                        },
                      });
                    }
                  }}
                  onDone={result => {
                    const newRelationId = ID.createEntityId();

                    const newRelation: StoreRelation = {
                      id: newRelationId,
                      space: spaceId,
                      index: INITIAL_RELATION_INDEX_VALUE,
                      typeOf: {
                        id: EntityId(r.attributeId),
                        name: r.attributeName,
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

                      if (result.verified) {
                        DB.upsert(
                          {
                            attributeId: SystemIds.VERIFIED_SOURCE_ATTRIBUTE,
                            attributeName: 'Verified Source',
                            entityId: newRelationId,
                            entityName: null,
                            value: {
                              type: 'CHECKBOX',
                              value: '1',
                            },
                          },
                          spaceId
                        );
                      }
                    }
                  }}
                />
              </div>
            );
          }

          return (
            <div key={`relation-select-entity-${relationId}`} data-testid="select-entity" className="w-full">
              <SelectEntity
                key={JSON.stringify(relationValueTypes)}
                spaceId={spaceId}
                relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
                onCreateEntity={result => {
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

                  if (valueType) {
                    send({
                      type: 'UPSERT_RELATION',
                      payload: {
                        fromEntityId: result.id,
                        fromEntityName: result.name,
                        toEntityId: valueType.typeId,
                        toEntityName: valueType.typeName ?? null,
                        typeOfId: SystemIds.TYPES_ATTRIBUTE,
                        typeOfName: 'Types',
                      },
                    });
                  }
                }}
                onDone={result => {
                  const newRelationId = ID.createEntityId();

                  const newRelation: StoreRelation = {
                    id: newRelationId,
                    space: spaceId,
                    index: INITIAL_RELATION_INDEX_VALUE,
                    typeOf: {
                      id: EntityId(r.attributeId),
                      name: r.attributeName,
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

                    if (result.verified) {
                      DB.upsert(
                        {
                          attributeId: SystemIds.VERIFIED_SOURCE_ATTRIBUTE,
                          attributeName: 'Verified Source',
                          entityId: newRelationId,
                          entityName: null,
                          value: {
                            type: 'CHECKBOX',
                            value: '1',
                          },
                        },
                        spaceId
                      );
                    }
                  }
                }}
                variant="fixed"
              />
            </div>
          );
        }

        if (renderableType === 'PLACE' && r.placeholder === true) {
          return (
            <InputPlace
              key={`place-input-${relationId}`}
              relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
              spaceId={spaceId}
              onDone={result => {
                const newRelationId = ID.createEntityId();

                const newRelation: StoreRelation = {
                  id: newRelationId,
                  space: spaceId,
                  index: INITIAL_RELATION_INDEX_VALUE,
                  typeOf: {
                    id: EntityId(r.attributeId),
                    name: r.attributeName,
                  },
                  fromEntity: {
                    id: EntityId(id),
                    name: name,
                  },
                  toEntity: {
                    id: EntityId(result.id),
                    name: result.name,
                    renderableType: 'PLACE',
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

                  if (result.verified) {
                    DB.upsert(
                      {
                        attributeId: SystemIds.VERIFIED_SOURCE_ATTRIBUTE,
                        attributeName: 'Verified Source',
                        entityId: newRelationId,
                        entityName: null,
                        value: {
                          type: 'CHECKBOX',
                          value: '1',
                        },
                      },
                      spaceId
                    );
                  }
                }
              }}
            />
          );
        }

        if (relationName !== 'Types') {
          return (
            <div
              key={`relation-${relationId}-${relationValue}`}
              className={`mt-1 ${
                renderableType === 'PLACE' ||
                (renderableType === 'RELATION' && r.attributeId === VENUE_PROPERTY)
                  ? 'w-full'
                  : ''
              }`}
            >
              <LinkableRelationChip
                isEditing
                onDelete={() => {
                  send({
                    type: 'DELETE_RELATION',
                    payload: {
                      renderable: r,
                    },
                  });
                }}
                entityHref={NavUtils.toEntity(spaceId, relationValue ?? '')}
                relationHref={NavUtils.toEntity(spaceId, relationId)}
              >
                {relationName ?? relationValue}
              </LinkableRelationChip>
              {renderableType === 'PLACE' ||
              // Currently, when we create an entity with a venue property and renderable type = 'PLACE',
              // the entity ends up with type = 'RELATION' after creation.
              // So temporary I'll add some checks to render it
              (renderableType === 'RELATION' && r.attributeId === VENUE_PROPERTY) ? (
                <div className="flex w-full flex-col">
                  <span className="my-3 text-[19px] leading-[29px]">{geoData?.name}</span>
                  <GeoLocationPointFields
                    key={relationId}
                    variant="body"
                    placeholder="Add value..."
                    aria-label="text-field"
                    value={geoData?.geoLocation}
                    onChange={() => {}}
                    hideInputs={true}
                  />
                </div>
              ) : null}
            </div>
          );
        }
      })}

      {!hasPlaceholders && typeOfRenderableType === 'RELATION' && (
        <div>
          <SelectEntityAsPopover
            key={JSON.stringify(relationValueTypes)}
            trigger={
              relations[0].valueName === 'Types' ? (
                <AddTypeButton icon={<Create className="h-3 w-3" color="grey-04" />} label="type" />
              ) : (
                <SquareButton icon={<Create />} />
              )
            }
            relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
            onCreateEntity={result => {
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

              if (valueType) {
                send({
                  type: 'UPSERT_RELATION',
                  payload: {
                    fromEntityId: result.id,
                    fromEntityName: result.name,
                    toEntityId: valueType.typeId,
                    toEntityName: valueType.typeName ?? null,
                    typeOfId: SystemIds.TYPES_ATTRIBUTE,
                    typeOfName: 'Types',
                  },
                });
              }
            }}
            onDone={result => {
              const newRelationId = ID.createEntityId();

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

                if (result.verified) {
                  DB.upsert(
                    {
                      attributeId: SystemIds.VERIFIED_SOURCE_ATTRIBUTE,
                      attributeName: 'Verified Source',
                      entityId: newRelationId,
                      entityName: null,
                      value: {
                        type: 'CHECKBOX',
                        value: '1',
                      },
                    },
                    spaceId
                  );
                }
              }
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

type TriplesGroupProps = {
  triples: TripleRenderableProperty[];
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
                onChange={value => {
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'TEXT',
                        value: value,
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
                key={renderable.attributeId}
                isEditing={true}
                value={renderable.value}
                format={renderable.options?.format}
                unitId={renderable.options?.unit}
                onChange={value =>
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      renderable,
                      value: {
                        type: 'NUMBER',
                        value: value,
                        options: {
                          format: renderable.options?.format,
                          unit: renderable.options?.unit,
                        },
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
                key={renderable.attributeId}
                onBlur={({ value, format }) =>
                  send({
                    type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                    payload: {
                      value: {
                        value,
                        type: 'TIME',
                        options: {
                          format,
                        },
                      },
                      renderable,
                    },
                  })
                }
                isEditing={true}
                value={renderable.value}
                format={renderable.options?.format}
              />
            );
          }

          case 'URL': {
            return (
              <WebUrlField
                key={renderable.attributeId}
                spaceId={spaceId}
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

          case 'POINT': {
            return (
              <>
                {renderable.attributeId === SystemIds.GEO_LOCATION_PROPERTY && renderable.type === 'POINT' ? (
                  <GeoLocationPointFields
                    key={renderable.attributeId}
                    variant="body"
                    placeholder="Add value..."
                    aria-label="text-field"
                    value={renderable.value}
                    onChange={value => {
                      send({
                        type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                        payload: {
                          renderable,
                          value: {
                            type: 'POINT',
                            value: value,
                          },
                        },
                      });
                    }}
                  />
                ) : (
                  <PageStringField
                    key={renderable.attributeId}
                    variant="body"
                    placeholder="Add value..."
                    aria-label="text-field"
                    value={renderable.value}
                    onChange={value => {
                      send({
                        type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                        payload: {
                          renderable,
                          value: {
                            type: 'POINT',
                            value: value,
                          },
                        },
                      });
                    }}
                  />
                )}
              </>
            );
          }
        }
      })}
    </div>
  );
}
