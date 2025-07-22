'use client';

import { ContentIds, Id, Position, SystemIds } from '@graphprotocol/grc-20';
// import { Image } from '@graphprotocol/grc-20';
import { useAtom } from 'jotai';

import * as React from 'react';

import { useEditableProperties } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useCover, useEntityTypes, useName } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryProperty, useRelations, useValues } from '~/core/sync/use-store';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import {
  Property,
  Relation,
  Value,
  ValueOptions,
} from '~/core/v2.types';

import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Graph } from '@graphprotocol/grc-20';
import { GeoLocationPointFields } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { editorHasContentAtom } from '~/atoms';
import { useCreateProperty } from '~/core/hooks/use-create-property';

function ShowablePanel({
  name,
  children,
  id,
  spaceId,
  hasEntries,
}: {
  id: string;
  name: string | null;
  spaceId: string;
  hasEntries: boolean;
  children: React.ReactNode;
}) {
  const coverUrl = useCover(id);
  const types = useEntityTypes(id, spaceId);
  const { blockIds } = useEditorStore();
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
    hasEntries;

  if (!showPropertiesPanel) {
    return null;
  }

  return <>{children}</>;
}

interface Props {
  id: string;
  spaceId: string;
}

export function EditableEntityPage({ id, spaceId }: Props) {
  const renderedProperties = useEditableProperties(id, spaceId);
  const propertiesEntries = Object.entries(renderedProperties);

  const { createProperty, addPropertyToEntity } = useCreateProperty(spaceId);

  const name = useName(id, spaceId);

  return (
    <ShowablePanel id={id} spaceId={spaceId} name={name} hasEntries={propertiesEntries.length > 0}>
      <div className="rounded-lg border border-grey-02 shadow-button">
        <div className="flex flex-col gap-6 p-5">
          {propertiesEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Text as="p" variant="body" color="grey-04">
                No properties added yet
              </Text>
              <Text as="p" variant="footnote" color="grey-03" className="mt-1">
                Click the + button below to add properties
              </Text>
            </div>
          )}
          {propertiesEntries.map(([propertyId, property]) => {
            // Hide cover/avatar/types/name property, user can upload cover using upload icon on top placeholder
            // and add types inline using the + button, add name under cover image component
            if (
              propertyId === SystemIds.COVER_PROPERTY ||
              propertyId === ContentIds.AVATAR_PROPERTY ||
              propertyId === SystemIds.TYPES_PROPERTY ||
              propertyId === SystemIds.NAME_PROPERTY
            ) {
              return null;
            }

            return (
              <div key={`${id}-${propertyId}`} className="relative break-words">
                <RenderedProperty spaceId={spaceId} property={property} />

                {property.dataType === 'RELATION' || property.renderableType === 'IMAGE' ? (
                  <RelationsGroup key={propertyId} propertyId={propertyId} id={id} spaceId={spaceId} />
                ) : (
                  <RenderedValue key={propertyId} propertyId={propertyId} entityId={id} spaceId={spaceId} />
                )}
                {/* We need to pin to top for Geo Location to prevent covering the display toggle */}
                <div
                  className={`absolute right-0 flex items-center gap-1 ${propertyId === SystemIds.GEO_LOCATION_PROPERTY && property.dataType === 'POINT' ? 'top-0' : 'top-6'}`}
                >
                  {/* Entity renderables only exist on Relation entities and are not changeable to another renderable type */}
                  <>
                    {/* Formatting exists on properties now instead of value */}
                    {/* {property.dataType === 'TIME' && (
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
                    )} */}
                    {/* @TODO: Formatting exists on property now instead of value */}
                    {/* {property.dataType === 'NUMBER' && (
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
                    )} */}

                    {/* <RenderableTypeDropdown value={renderableType} options={[]} /> */}

                    {/* Relation renderable types don't render the delete button. Instead you delete each individual relation */}
                    {/* {property.dataType !== 'RELATION' && (
                        <SquareButton
                          icon={<Trash />}
                          onClick={() => {
                            storage.renderables.values.delete(firstRenderable as NativeRenderableProperty);
                          }}
                        />
                      )} */}
                  </>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4">
          <SelectEntityAsPopover
            trigger={<SquareButton icon={<Create />} />}
            spaceId={spaceId}
            relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
            onCreateEntity={result => {
              const selectedPropertyType = result.selectedPropertyType || 'TEXT';
              
              const createdPropertyId = createProperty({
                name: result.name || '',
                propertyType: selectedPropertyType,
                verified: result.verified,
                space: result.space,
              });

              // Immediately add the property to the entity
              addPropertyToEntity({
                entityId: id,
                propertyId: createdPropertyId,
                propertyName: result.name || '',
                entityName: name || undefined,
              });
            }}
            onDone={result => {
              if (result) {
                addPropertyToEntity({
                  entityId: id,
                  propertyId: result.id,
                  propertyName: result.name,
                  entityName: name || undefined,
                });
              }
            }}
          />
        </div>
      </div>
    </ShowablePanel>
  );
}


function RenderedProperty({ property, spaceId }: { property: Property; spaceId: string }) {
  return (
    <Link href={NavUtils.toEntity(spaceId, property.id)}>
      <Text as="p" variant="bodySemibold">
        {property.name ?? property.id}
      </Text>
    </Link>
  );
}

type RelationsGroupProps = {
  propertyId: string;
  id: string;
  spaceId: string;
};

export function RelationsGroup({ propertyId, id, spaceId }: RelationsGroupProps) {
  const { storage } = useMutate();
  const name = useName(id, spaceId);

  // @TODO: Should just read from local property store instead of querying since
  // it should already be queried in useEditableProperties
  const { property } = useQueryProperty({ id: propertyId });

  const relations = useRelations({
    selector: r => r.fromEntity.id === id && r.spaceId === spaceId && r.type.id === propertyId,
  });


  // Always call useValues hook to maintain hook order consistency (must be before early returns)
  const allValues = useValues({
    selector: v => v.spaceId === spaceId,
  });

  // For IMAGE properties, get the image URL from related image entities
  const imageRelation = relations.find(r => r.renderableType === 'IMAGE');
  const imageEntityId = imageRelation?.toEntity.id;
  
  // Find the image URL value (typically the first value with an ipfs:// URL)
  const imageSrc = React.useMemo(() => {
    if (!property || property.renderableType !== SystemIds.IMAGE || !imageEntityId) return undefined;
    
    // Filter values for the specific image entity
    const imageEntityValues = allValues.filter(v => v.entity.id === imageEntityId);
    
    const imageUrlValue = imageEntityValues.find(v => 
      typeof v.value === 'string' && v.value.startsWith('ipfs://')
    );
    
    return imageUrlValue?.value;
  }, [property, imageEntityId, allValues]);

  if (!property) {
    return null;
  }

  const typeOfId = property.id;
  const typeOfName = property.name;
  const relationValueTypes = property.relationValueTypes;
  const valueType = relationValueTypes?.[0];
  const isEmpty = relations.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-wrap items-center gap-1 pr-10">
        {property.renderableTypeStrict === 'IMAGE' ? (
          <div key="relation-upload-image">
            <PageImageField
              imageSrc={imageSrc}
              onFileChange={async file => {
                // Create the image entity using the new Graph API with blob
                const { id: imageId, ops: createImageOps } = await Graph.createImage({
                  blob: file,
                });

                
                // Process the operations returned by Graph.createImage
                for (const op of createImageOps) {
                  if (op.type === 'CREATE_RELATION') {
                    storage.relations.set({
                      id: op.relation.id,
                      entityId: op.relation.entity,
                      fromEntity: {
                        id: op.relation.fromEntity,
                        name: null,
                      },
                      type: {
                        id: op.relation.type,
                        name: 'Types',
                      },
                      toEntity: {
                        id: op.relation.toEntity,
                        name: 'Image',
                        value: op.relation.toEntity,
                      },
                      spaceId,
                      position: Position.generate(),
                      verified: false,
                      renderableType: 'RELATION',
                    });
                  } else if (op.type === 'UPDATE_ENTITY') {
                    // Create values for each property in the entity update
                    for (const value of op.entity.values) {
                      storage.values.set({
                        entity: {
                          id: op.entity.id,
                          name: null,
                        },
                        property: {
                          id: value.property,
                          name: 'Image Property',
                          dataType: 'TEXT',
                          renderableType: 'URL',
                        },
                        spaceId,
                        value: value.value,
                      });
                    }
                  }
                }
                
                // Create relation from parent entity to image entity
                const newRelationId = ID.createEntityId();
                storage.relations.set({
                  id: newRelationId,
                  entityId: ID.createEntityId(),
                  fromEntity: {
                    id: id,
                    name: name || '',
                  },
                  type: {
                    id: propertyId,
                    name: typeOfName,
                  },
                  toEntity: {
                    id: imageId,
                    name: null,
                    value: imageId,
                  },
                  spaceId,
                  position: Position.generate(),
                  verified: false,
                  renderableType: 'IMAGE',
                });
              }}
              onImageRemove={() => console.log(`remove`)}
            />
          </div>
        ) : (
          <div key={`relation-select-entity-${property.id}`} data-testid="select-entity" className="w-full">
            <SelectEntity
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
                      id: valueType.id,
                      name: valueType.name,
                      value: valueType.id,
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
                  position: Position.generate(),
                  renderableType: 'RELATION',
                  verified: false,
                  entityId: newEntityId,
                  type: {
                    id: propertyId,
                    name: property.name,
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
              variant="fixed"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 pr-10">
      {relations.map(r => {
        const relationId = r.id;
        const relationName = r.toEntity.name;
        const relationValue = r.toEntity.id;

        if (property.renderableTypeStrict === 'IMAGE') {
          // relationValue is the image entity ID, we need to get the actual image URL
          const imageEntityValues = allValues.filter(v => v.entity.id === relationValue);
          const imageUrlValue = imageEntityValues.find(v => 
            typeof v.value === 'string' && v.value.startsWith('ipfs://')
          );
          const actualImageSrc = imageUrlValue?.value;
          
          return <ImageZoom key={`image-${relationId}-${relationValue}`} imageSrc={getImagePath(actualImageSrc || '')} />;
        }

        return (
          <div key={`relation-${relationId}-${relationValue}`}>
            <LinkableRelationChip
              isEditing
              onDelete={() => storage.relations.delete(r)}
              currentSpaceId={spaceId}
              entityId={relationValue}
              relationId={relationId}
            >
              {relationName ?? relationValue}
            </LinkableRelationChip>
          </div>
        );
      })}

      {property.renderableType !== SystemIds.IMAGE && (
        <div>
          <SelectEntityAsPopover
            trigger={
              propertyId === SystemIds.TYPES_PROPERTY ? (
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
                  id: valueType.id,
                  name: valueType.name,
                  value: valueType.id,
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
              position: Position.generate(),
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

function RenderedValue({ entityId, propertyId, spaceId }: { entityId: string; propertyId: string; spaceId: string }) {
  const { storage } = useMutate();
  const { property } = useQueryProperty({ id: propertyId });


  const values = useValues({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  const rawValue: Value | undefined = values[0] as Value | undefined;
  const value = rawValue?.value ?? '';
  const options = rawValue?.options;

  if (!property) {
    return null;
  }

  if (propertyId === SystemIds.NAME_PROPERTY) {
    return null;
  }

  const onChange = (value: string, options?: ValueOptions) => {
    if (!rawValue) {
      storage.values.set({
        spaceId,
        entity: {
          id: entityId,
          name: null,
        },
        property: {
          id: property.id,
          name: property.name,
          dataType: property.dataType,
          renderableType: property.renderableType,
        },
        value: value,
        options,
      });

      return;
    }

    storage.values.update(rawValue, draft => {
      draft.value = value;
      draft.options = options;
    });
  };

  switch (property.dataType) {
    case 'TEXT': {
      return (
        <PageStringField
          key={propertyId}
          variant="body"
          placeholder="Add value..."
          aria-label="text-field"
          value={value}
          onChange={onChange}
        />
      );
    }
    case 'NUMBER':
      return (
        <NumberField
          key={propertyId}
          isEditing={true}
          value={value}
          // @TODO(migration): Fix formatting. Now on property
          // format={renderable.options?.format}
          unitId={options?.unit}
          onChange={onChange}
        />
      );
    case 'CHECKBOX': {
      const checked = getChecked(value);

      return (
        <Checkbox
          key={`checkbox-${propertyId}-${value}`}
          checked={checked}
          onChange={() => {
            onChange(checked ? '0' : '1');
          }}
        />
      );
    }
    case 'TIME': {
      return (
        <DateField
          key={propertyId}
          // format={renderable.options?.format}
          onBlur={({ value }) => {
            onChange(value);
          }}
          isEditing={true}
          value={value}
          propertyId={propertyId}
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
          {propertyId === SystemIds.GEO_LOCATION_PROPERTY && property.dataType === 'POINT' ? (
            <GeoLocationPointFields
              key={propertyId}
              variant="body"
              placeholder="Add value..."
              aria-label="text-field"
              value={value}
              onChange={onChange}
            />
          ) : (
            <PageStringField
              key={propertyId}
              variant="body"
              placeholder="Add value..."
              aria-label="text-field"
              value={value}
              onChange={onChange}
            />
          )}
        </>
      );
    }
  }
}
