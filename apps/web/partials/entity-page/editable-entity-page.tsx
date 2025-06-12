'use client';

import { ContentIds, Id, SystemIds } from '@graphprotocol/grc-20';
// import { Image } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import { useAtom } from 'jotai';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { Entities } from '~/core/utils/entity';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import {
  NativeRenderableProperty,
  PropertySchema,
  Relation,
  RelationRenderableProperty,
  RenderableProperty,
  Value,
  ValueRenderableProperty,
} from '~/core/v2.types';

import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationPointFields } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { DateFormatDropdown } from './date-format-dropdown';
import { NumberOptionsDropdown } from './number-options-dropdown';
import { RenderableTypeDropdown } from './renderable-type-dropdown';
import { editorHasContentAtom } from '~/atoms';

interface Props {
  values: Value[];
  id: string;
  spaceId: string;
}

export function EditableEntityPage({ id, spaceId, values }: Props) {
  const entityId = id;

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    useRenderables(values, spaceId, isRelationPage);
  const { name, relations, types } = useEntityPageStore();
  const { storage } = useMutate();

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
  // 5. If there are more than 0 properties
  const showPropertiesPanel =
    (name && name?.length > 0) ||
    coverUrl ||
    types.length > 0 ||
    (blockIds && blockIds.length > 0) ||
    editorHasContent ||
    Object.entries(renderablesGroupedByAttributeId).length > 0;

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

              // Hide cover/avatar/types/name property, user can upload cover using upload icon on top placeholder
              // and add types inline using the + button, add name under cover image component
              if (
                (renderableType === 'IMAGE' && firstRenderable.propertyId === SystemIds.COVER_PROPERTY) ||
                (renderableType === 'IMAGE' && firstRenderable.propertyId === ContentIds.AVATAR_PROPERTY) ||
                (renderableType === 'RELATION' && firstRenderable.propertyId === SystemIds.TYPES_PROPERTY) ||
                (renderableType === 'TEXT' && firstRenderable.propertyId === SystemIds.NAME_PROPERTY)
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
                      if (firstRenderable.placeholder === true && firstRenderable.propertyId === '') {
                        removeEmptyPlaceholderRenderable(firstRenderable);
                      }
                    }}
                  />
                  {renderableType === 'RELATION' || renderableType === 'IMAGE' ? (
                    <RelationsGroup
                      key={attributeId}
                      relations={renderables as RelationRenderableProperty[]}
                      properties={properties}
                    />
                  ) : (
                    <ValuesGroup key={attributeId} values={renderables as ValueRenderableProperty[]} />
                  )}
                  {/* We need to pin to top for Geo Location to prevent covering the display toggle */}
                  <div
                    className={`absolute right-0 flex items-center gap-1 ${firstRenderable.propertyId === SystemIds.GEO_LOCATION_PROPERTY && renderableType === 'POINT' ? 'top-0' : 'top-6'}`}
                  >
                    {/* Entity renderables only exist on Relation entities and are not changeable to another renderable type */}
                    <>
                      {renderableType === 'TIME' && (
                        <DateFormatDropdown
                          value={firstRenderable.value}
                          // @TODO(migration): fix formatting. Now on property
                          // format={firstRenderable.options?.format}
                          onSelect={(value?: string, format?: string) => {
                            storage.renderables.values.update(firstRenderable, draft => {
                              draft.value = value ?? firstRenderable.value;
                            });
                          }}
                        />
                      )}
                      {renderableType === 'NUMBER' && (
                        <NumberOptionsDropdown
                          value={firstRenderable.value}
                          // @TODO(migration): Fix format. Now defined on Property
                          // format={firstRenderable.options?.format}
                          unitId={firstRenderable.options?.unit}
                          send={({ format, unitId }) => {
                            storage.renderables.values.update(firstRenderable, draft => {
                              const newOptions = {
                                language: draft.options?.language,
                                unit: unitId,
                              };

                              draft.options = newOptions;
                            });
                          }}
                        />
                      )}
                      {/* 
                        @TODO(migration): Renderable type is no longer selectable. Instead it's
                        defined on the Property
                      */}
                      <RenderableTypeDropdown value={renderableType} options={[]} />

                      {/* Relation renderable types don't render the delete button. Instead you delete each individual relation */}
                      {renderableType !== 'RELATION' && (
                        <SquareButton
                          icon={<Trash />}
                          onClick={() => {
                            storage.renderables.values.delete(firstRenderable as NativeRenderableProperty);
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
                  propertyId: '',
                  propertyName: null,
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
  const { spaceId } = useEntityPageStore();
  const { storage } = useMutate();

  if (renderable.propertyId === '') {
    return (
      <>
        <SelectEntity
          placeholder="Add property..."
          spaceId={spaceId}
          relationValueTypes={[{ typeId: SystemIds.PROPERTY, typeName: 'Property' }]}
          onCreateEntity={result => {
            storage.renderables.values.set({
              propertyId: SystemIds.NAME_PROPERTY,
              entityId: result.id,
              spaceId,
              propertyName: 'Name',
              entityName: result.name,
              type: 'TEXT',
              value: result.name ?? '',
            });

            storage.relations.set({
              id: Id.generate(),
              entityId: Id.generate(),
              spaceId,
              renderableType: 'RELATION',
              verified: result.verified,
              toSpaceId: result.space,
              type: {
                id: SystemIds.TYPES_PROPERTY,
                name: 'Types',
              },
              fromEntity: {
                id: result.id,
                name: result.name,
              },
              toEntity: {
                id: SystemIds.PROPERTY,
                name: 'Property',
                value: SystemIds.PROPERTY,
              },
            });
          }}
          onDone={result => {
            onChange();

            // @TODO(migration): Change functionality based on property data type

            // .send({
            //   type: 'UPSERT_PROPERTY',
            //   payload: { renderable, propertyId: result.id, propertyName: result.name },
            // });
          }}
          withSelectSpace={false}
          advanced={false}
        />
      </>
    );
  }

  return (
    <Link href={NavUtils.toEntity(spaceId, renderable.propertyId)}>
      <Text as="p" variant="bodySemibold">
        {renderable.propertyName ?? renderable.propertyId}
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
  const { storage } = useMutate();

  const typeOfId = relations[0].propertyId;
  const typeOfName = relations[0].propertyName;
  const typeOfRenderableType = relations[0].type;
  const property = properties?.[typeOfId];
  const relationValueTypes = property?.relationValueTypes;
  const hasPlaceholders = relations.some(r => r.placeholder === true);
  const valueType = relationValueTypes?.[0];

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
                  // const { id: imageId, ops } = Image.make({ cid: imageSrc });
                  // const [createRelationOp, setTripleOp] = ops;
                  // if (createRelationOp.type === 'CREATE_RELATION') {
                  //   send({
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
                  // }
                  // if (setTripleOp.type === 'SET_TRIPLE') {
                  //   DB.upsert(
                  //     {
                  //       value: {
                  //         type: 'URL',
                  //         value: setTripleOp.triple.value.value,
                  //       },
                  //       entityId: imageId,
                  //       attributeId: setTripleOp.triple.attribute,
                  //       entityName: null,
                  //       attributeName: 'Image URL',
                  //     },
                  //     spaceId
                  //   );
                  //   send({
                  //     type: 'UPSERT_RELATION',
                  //     payload: {
                  //       fromEntityId: id,
                  //       fromEntityName: name,
                  //       toEntityId: imageId,
                  //       toEntityName: null,
                  //       typeOfId: r.attributeId,
                  //       typeOfName: r.attributeName,
                  //       renderableType: 'IMAGE',
                  //       value: setTripleOp.triple.value.value,
                  //     },
                  //   });
                  // }
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
                key={JSON.stringify(relationValueTypes)}
                spaceId={spaceId}
                relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
                onCreateEntity={result => {
                  storage.values.set({
                    id: ID.createValueId({
                      entityId: result.id,
                      propertyId: SystemIds.NAME_PROPERTY,
                      spaceId,
                    }),
                    entity: {
                      id: result.id,
                      name: result.name,
                    },
                    property: {
                      id: SystemIds.NAME_PROPERTY,
                      name: 'Name',
                      dataType: 'TEXT',
                    },
                    spaceId,
                    value: result.name ?? '',
                  });

                  if (valueType) {
                    storage.relations.set({
                      id: Id.generate(),
                      entityId: Id.generate(),
                      spaceId,
                      renderableType: 'RELATION',
                      verified: result.verified,
                      toSpaceId: result.space,
                      type: {
                        id: SystemIds.TYPES_PROPERTY,
                        name: 'Types',
                      },
                      fromEntity: {
                        id: result.id,
                        name: result.name,
                      },
                      toEntity: {
                        id: valueType.typeId,
                        name: valueType.typeName,
                        value: valueType.typeId,
                      },
                    });
                  }
                }}
                onDone={result => {
                  const newRelationId = ID.createEntityId();
                  // @TODO(migration): lightweight relation pointing to entity id
                  const newEntityId = ID.createEntityId();

                  const newRelation: Relation = {
                    id: newRelationId,
                    spaceId: spaceId,
                    position: INITIAL_RELATION_INDEX_VALUE,
                    renderableType: 'RELATION',
                    verified: false,
                    entityId: newEntityId,
                    type: {
                      id: EntityId(r.propertyId),
                      name: r.propertyName,
                    },
                    fromEntity: {
                      id: EntityId(id),
                      name: name,
                    },
                    toEntity: {
                      id: EntityId(result.id),
                      name: result.name,
                      value: EntityId(result.id),
                    },
                  };

                  if (result.space) {
                    newRelation.toSpaceId = result.space;
                  }

                  if (result.verified) {
                    newRelation.verified = true;
                  }

                  storage.relations.set(newRelation);
                }}
                variant="fixed"
              />
            </div>
          );
        }

        if (relationName !== 'Types') {
          return (
            <div key={`relation-${relationId}-${relationValue}`}>
              <LinkableRelationChip
                isEditing
                onDelete={() => storage.renderables.relations.delete(r)}
                currentSpaceId={spaceId}
                entityId={relationValue}
                relationId={relationId}
              >
                {relationName ?? relationValue}
              </LinkableRelationChip>
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
              storage.values.set({
                id: ID.createValueId({
                  entityId: result.id,
                  propertyId: SystemIds.NAME_PROPERTY,
                  spaceId,
                }),
                entity: {
                  id: result.id,
                  name: result.name,
                },
                property: {
                  id: SystemIds.NAME_PROPERTY,
                  name: 'Name',
                  dataType: 'TEXT',
                },
                spaceId,
                value: result.name ?? '',
              });

              if (valueType) {
                storage.relations.set({
                  id: Id.generate(),
                  entityId: Id.generate(),
                  spaceId,
                  renderableType: 'RELATION',
                  toSpaceId: result.space,
                  type: {
                    id: SystemIds.TYPES_PROPERTY,
                    name: 'Types',
                  },
                  fromEntity: {
                    id: result.id,
                    name: result.name,
                  },
                  toEntity: {
                    id: valueType.typeId,
                    name: valueType.typeName,
                    value: valueType.typeId,
                  },
                });
              }
            }}
            onDone={result => {
              const newRelationId = ID.createEntityId();
              // @TODO(migration): lightweight relation pointing to entity id
              const newEntityId = ID.createEntityId();

              const newRelation: Relation = {
                id: newRelationId,
                spaceId: spaceId,
                position: INITIAL_RELATION_INDEX_VALUE,
                renderableType: 'RELATION',
                verified: false,
                entityId: newEntityId,
                type: {
                  id: typeOfId,
                  name: typeOfName,
                },
                fromEntity: {
                  id: id,
                  name: name,
                },
                toEntity: {
                  id: result.id,
                  name: result.name,
                  value: result.id,
                },
              };

              if (result.space) {
                newRelation.toSpaceId = result.space;
              }

              if (result.verified) {
                newRelation.verified = true;
              }

              storage.relations.set(newRelation);
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

type ValuesGroupProps = {
  values: ValueRenderableProperty[];
};

function ValuesGroup({ values }: ValuesGroupProps) {
  const { storage } = useMutate();

  return (
    <div className="flex flex-wrap gap-2">
      {values.map(renderable => {
        switch (renderable.type) {
          case 'TEXT': {
            return (
              <PageStringField
                key={renderable.propertyId}
                variant="body"
                placeholder="Add value..."
                aria-label="text-field"
                value={renderable.value}
                onChange={value => {
                  storage.renderables.values.update(renderable, draft => {
                    draft.value = value;
                  });
                }}
              />
            );
          }
          case 'NUMBER':
            return (
              <NumberField
                key={renderable.propertyId}
                isEditing={true}
                value={renderable.value}
                // @TODO(migration): Fix formatting. Now on property
                // format={renderable.options?.format}
                unitId={renderable.options?.unit}
                onChange={value => {
                  storage.renderables.values.update(renderable, draft => {
                    draft.value = value;
                  });
                }}
              />
            );
          case 'CHECKBOX': {
            const checked = getChecked(renderable.value);

            return (
              <Checkbox
                key={`checkbox-${renderable.propertyId}-${renderable.value}`}
                checked={checked}
                onChange={() => {
                  storage.renderables.values.update(renderable, draft => {
                    draft.value = !checked ? '1' : '0';
                  });
                }}
              />
            );
          }
          case 'TIME': {
            return (
              <DateField
                key={renderable.propertyId}
                // format={renderable.options?.format}
                onBlur={({ value, format }) =>
                  storage.renderables.values.update(renderable, draft => {
                    draft.value = value;
                  })
                }
                isEditing={true}
                value={renderable.value}
                // @TODO(migration): Fix formatting. Now on property
              />
            );
          }

          // @TODO(migration): Fix url renderable
          // case 'URL': {
          //   return (
          //     <WebUrlField
          //       key={renderable.propertyId}
          //       spaceId={spaceId}
          //       placeholder="Add a URI"
          //       isEditing={true}
          //       onBlur={event =>
          //         send({
          //           type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          //           payload: {
          //             value: {
          //               value: event.target.value,
          //               type: 'URL',
          //             },
          //             renderable,
          //           },
          //         })
          //       }
          //       value={renderable.value}
          //     />
          //   );
          // }

          case 'POINT': {
            return (
              <>
                {renderable.propertyId === SystemIds.GEO_LOCATION_PROPERTY && renderable.type === 'POINT' ? (
                  <GeoLocationPointFields
                    key={renderable.propertyId}
                    variant="body"
                    placeholder="Add value..."
                    aria-label="text-field"
                    value={renderable.value}
                    onChange={value => {
                      storage.renderables.values.update(renderable, draft => {
                        draft.value = value;
                      });
                    }}
                  />
                ) : (
                  <PageStringField
                    key={renderable.propertyId}
                    variant="body"
                    placeholder="Add value..."
                    aria-label="text-field"
                    value={renderable.value}
                    onChange={value => {
                      storage.renderables.values.update(renderable, draft => {
                        draft.value = value;
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
