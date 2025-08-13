'use client';

import { ContentIds, IdUtils, Position, SystemIds } from '@graphprotocol/grc-20';
// import { Image } from '@graphprotocol/grc-20';
import { useAtom } from 'jotai';

import * as React from 'react';

import { FORMAT_PROPERTY } from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useEditableProperties } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useCover, useEntityTypes, useName } from '~/core/state/entity-page-store/entity-store';
import { Mutator, useMutate } from '~/core/sync/use-mutate';
import { useQueryProperty, useRelations, useValue } from '~/core/sync/use-store';
import { NavUtils, getImagePath, useImageUrlFromEntity } from '~/core/utils/utils';
import { Property, Relation, ValueOptions } from '~/core/v2.types';

import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, PageImageField, PageStringField } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationPointFields } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import SuggestedFormats from '~/design-system/suggested-formats-window';
import { Text } from '~/design-system/text';

import { getEntityTemplate } from '~/partials/entity-page/utils/get-entity-template';

import { editorHasContentAtom } from '~/atoms';

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
  const coverUrl = useCover(id, spaceId);
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
              const renderableType = result.renderableType || 'TEXT';

              const createdPropertyId = createProperty({
                name: result.name || '',
                propertyType: renderableType,
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
                  propertyName: result.name || '',
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

  // For IMAGE properties, get the image URL from related image entities
  const imageRelation = relations.find(r => r.renderableType === 'IMAGE');
  const imageEntityId = imageRelation?.toEntity.id;

  // Use the efficient hook to get only the image URL for this specific entity
  const imageSrc = useImageUrlFromEntity(imageEntityId, spaceId);

  if (!property) {
    return null;
  }

  const typeOfId = property.id;
  const isType = propertyId === SystemIds.TYPES_PROPERTY;
  
  const templateOptions = {
    entityId: id,
    entityName: name,
    propertyId,
    spaceId,
    storage,
  };
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
                // Use the consolidated helper to create and link the image
                await storage.images.createAndLink({
                  file,
                  fromEntityId: id,
                  fromEntityName: name,
                  relationPropertyId: propertyId,
                  relationPropertyName: typeOfName,
                  spaceId,
                });
              }}
              onImageRemove={() => console.log(`remove`)}
            />
          </div>
        ) : (
          <div key={`relation-select-entity-${property.id}`} data-testid="select-entity" className="w-full">
            <SelectEntity
              spaceId={spaceId}
              placeholder={isType ? "Find or create type..." : undefined}
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
                    id: IdUtils.generate(),
                    entityId: IdUtils.generate(),
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
              onDone={async result => {
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

                await applyTemplate({ ...templateOptions, typeId: result.id });
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
          return (
            <ImageRelation
              key={`image-${relationId}-${relationValue}`}
              relationValue={relationValue}
              spaceId={spaceId}
            />
          );
        }

        return (
          <div key={`relation-${relationId}-${relationValue}`}>
            <LinkableRelationChip
              isEditing
              onDelete={() => storage.relations.delete(r)}
              onDone={result => {
                storage.relations.update(r, draft => {
                  draft.toSpaceId = result.space;
                  draft.verified = result.verified;
                });
              }}
              currentSpaceId={spaceId}
              entityId={relationValue}
              relationId={relationId}
              relationEntityId={r.entityId}
              spaceId={r.toSpaceId}
              verified={r.verified}
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
              isType ? (
                <AddTypeButton icon={<Create className="h-3 w-3" color="grey-04" />} label="type" />
              ) : (
                <SquareButton icon={<Create />} />
              )
            }
            placeholder={isType ? "Find or create type..." : undefined}
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
                  id: IdUtils.generate(),
                  entityId: IdUtils.generate(),
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
            onDone={async result => {
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

              await applyTemplate({ ...templateOptions, propertyId: typeOfId, typeId: result.id });
            }}
            spaceId={spaceId}
          />
        </div>
      )}
    </div>
  );
}

function ImageRelation({ relationValue, spaceId }: { relationValue: string; spaceId: string }) {
  // Use the efficient hook to get only the image URL for this specific entity
  const actualImageSrc = useImageUrlFromEntity(relationValue, spaceId);

  return <ImageZoom imageSrc={getImagePath(actualImageSrc || '')} />;
}

function RenderedValue({ entityId, propertyId, spaceId }: { entityId: string; propertyId: string; spaceId: string }) {
  const { storage } = useMutate();
  const { property } = useQueryProperty({ id: propertyId });

  const rawValue = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

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
        <>
          <PageStringField
            key={propertyId}
            variant="body"
            placeholder="Add value..."
            aria-label="text-field"
            value={value}
            onChange={onChange}
          />
          {property.id === FORMAT_PROPERTY && (
            <SuggestedFormats entityId={entityId} spaceId={spaceId} value={value} onChange={onChange} />
          )}
        </>
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

async function applyTemplate(templateOptions: {
  entityId: string;
  entityName: string | null;
  propertyId: string;
  typeId: string;
  spaceId: string;
  storage: Mutator;
}) {
  const { entityId, entityName, propertyId, typeId, spaceId, storage } = templateOptions;
  
  if (propertyId !== SystemIds.TYPES_PROPERTY) {
    return;
  }

  const template = await getEntityTemplate(typeId, entityId, entityName, spaceId);
  
  if (!template) {
    return;
  }

  for (const value of template.values) {
    storage.values.set(value);
  }

  for (const relation of template.relations) {
    storage.relations.set(relation);
  }
}
