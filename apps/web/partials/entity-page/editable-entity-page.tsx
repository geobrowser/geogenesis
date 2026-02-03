'use client';

import { ContentIds, IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';
import { useAtom } from 'jotai';

import * as React from 'react';

import {
  DATA_TYPE_PROPERTY,
  FORMAT_PROPERTY,
  IS_TYPE_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  VALUE_TYPE_PROPERTY,
} from '~/core/constants';
import { ADDRESS_PROPERTY, VENUE_PROPERTY } from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useEditableProperties } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import { useEditorStore } from '~/core/state/editor/use-editor';
import {
  useEntitySchema,
  useEntityTypes,
  useName,
  useRelationEntityRelations,
} from '~/core/state/entity-page-store/entity-store';
import { Mutator, useMutate } from '~/core/sync/use-mutate';
import { useQueryProperty, useRelations, useValue, useValues } from '~/core/sync/use-store';
import { Property, Relation, ValueOptions } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';
import { useImageUrlFromEntity, useVideoUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableMediaChip, LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import {
  ImageZoom,
  PageImageField,
  PageStringField,
  PageVideoField,
  VideoPlayer,
} from '~/design-system/editable-fields/editable-fields';
import { GeoLocationPointFields, GeoLocationWrapper } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { InputPlace } from '~/design-system/input-address';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import ReorderableRelationChipsDnd from '~/design-system/reorderable-relation-chips-dnd';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import SuggestedFormats from '~/design-system/suggested-formats-window';
import { Text } from '~/design-system/text';

import { DataTypePill } from '~/partials/entity-page/data-type-pill';
import { getEntityTemplate } from '~/partials/entity-page/utils/get-entity-template';

import { editorHasContentAtom } from '~/atoms';

type EditableEntityPageProps = {
  id: string;
  spaceId: string;
};

export function EditableEntityPage({ id, spaceId }: EditableEntityPageProps) {
  const { createProperty, addPropertyToEntity } = useCreateProperty(spaceId);

  const name = useName(id, spaceId);
  const shouldShowPanel = useShouldShowPropertiesPanel(id, spaceId);
  const visiblePropertiesEntries = useVisiblePropertiesEntries(id, spaceId);

  const relationEntityRelations = useRelationEntityRelations(id, spaceId);
  const isRelationPage = relationEntityRelations.length > 0;

  // Get schema properties from the entity's types - these are placeholders that can't be deleted
  const schemaProperties = useEntitySchema(id, spaceId);
  const schemaPropertyIds = React.useMemo(() => new Set(schemaProperties.map(p => p.id)), [schemaProperties]);

  if (!shouldShowPanel && !isRelationPage) {
    return null;
  }

  return (
    <div className="relative rounded-lg border border-grey-02 shadow-button">
      <div className="flex flex-col gap-6 p-5">
        {visiblePropertiesEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center">
            <Text as="p" variant="body" color="grey-04">
              No properties added yet
            </Text>
            <Text as="p" variant="footnote" color="grey-03" className="mt-1">
              Click the + button below to add properties
            </Text>
          </div>
        )}
        {visiblePropertiesEntries.map(([propertyId, property]) => {
          const isRelation = property.dataType === 'RELATION' || property.renderableType === 'IMAGE';

          const isVideo = property.renderableType === 'VIDEO' || property.renderableTypeStrict === 'VIDEO';

          return (
            <div key={`${id}-${propertyId}`} className="break-words">
              <RenderedProperty spaceId={spaceId} property={property} />

              {isRelation || isVideo ? (
                <RelationPropertyWithDelete
                  key={propertyId}
                  propertyId={propertyId}
                  entityId={id}
                  spaceId={spaceId}
                  property={property}
                  isSchemaProperty={schemaPropertyIds.has(propertyId)}
                />
              ) : (
                <RenderedValue
                  key={propertyId}
                  propertyId={propertyId}
                  entityId={id}
                  spaceId={spaceId}
                  property={property}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className={visiblePropertiesEntries.length === 0 ? 'absolute bottom-0 left-0 p-4' : 'p-4'}>
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

            return createdPropertyId;
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

type RelationPropertyWithDeleteProps = {
  propertyId: string;
  entityId: string;
  spaceId: string;
  property: Property;
  isSchemaProperty: boolean;
};

function RelationPropertyWithDelete({
  propertyId,
  entityId,
  spaceId,
  property,
  isSchemaProperty,
}: RelationPropertyWithDeleteProps) {
  const { storage } = useMutate();

  const propertyRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === propertyId,
  });

  // Get the value entry for this property (created when property was added to entity)
  const propertyValue = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <RelationsGroup key={propertyId} propertyId={propertyId} id={entityId} spaceId={spaceId} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DataTypePill
          dataType={property.dataType}
          renderableType={
            property.renderableTypeStrict
              ? { id: property.renderableType ?? null, name: property.renderableTypeStrict }
              : null
          }
          spaceId={spaceId}
          iconOnly={true}
        />
        {/* Show delete button if: not a schema property, OR schema property with content to clear */}
        {(!isSchemaProperty || propertyRelations.length > 0) && (
          <SquareButton
            icon={<Trash />}
            onClick={() => {
              // Delete all relations for this property
              propertyRelations.forEach(relation => storage.relations.delete(relation));
              // Also delete the value entry to fully remove the property from the entity
              if (propertyValue) {
                storage.values.delete(propertyValue);
              }
            }}
          />
        )}
      </div>
    </div>
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

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

  // For VIDEO properties, get the video URL from related video entities
  const videoRelation = relations.find(r => r.renderableType === 'VIDEO');
  const videoEntityId = videoRelation?.toEntity.id;

  // Use the efficient hook to get only the video URL for this specific entity
  const videoSrc = useVideoUrlFromEntity(videoEntityId, spaceId);

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

  // Handler for file upload (images and videos)
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      if (property.renderableTypeStrict === 'VIDEO') {
        await storage.videos.createAndLink({
          file,
          fromEntityId: id,
          fromEntityName: name,
          relationPropertyId: propertyId,
          relationPropertyName: typeOfName,
          spaceId,
        });
      } else {
        await storage.images.createAndLink({
          file,
          fromEntityId: id,
          fromEntityName: name,
          relationPropertyId: propertyId,
          relationPropertyName: typeOfName,
          spaceId,
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileUpload(e.target.files[0]);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  if (isEmpty) {
    return (
      <div className="flex flex-wrap items-center gap-1 pr-1">
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
            />
          </div>
        ) : property.renderableTypeStrict === 'VIDEO' ? (
          <div key="relation-upload-video">
            <PageVideoField
              videoSrc={videoSrc}
              onFileChange={async file => {
                // Use the consolidated helper to create and link the video
                await storage.videos.createAndLink({
                  file,
                  fromEntityId: id,
                  fromEntityName: name,
                  relationPropertyId: propertyId,
                  relationPropertyName: typeOfName,
                  spaceId,
                });
              }}
            />
          </div>
        ) : propertyId === VENUE_PROPERTY ? (
          <div key="relation-place-input">
            <InputPlace
              spaceId={spaceId}
              relationValueTypes={relationValueTypes}
              onDone={async result => {
                const newRelationId = ID.createEntityId();
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
            />
          </div>
        ) : (
          <div key={`relation-select-entity-${property.id}`} data-testid="select-entity" className="w-full">
            <SelectEntity
              spaceId={spaceId}
              placeholder={isType ? 'Find or create type...' : undefined}
              relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
              onCreateEntity={result => {
                // Check if we're creating a Property entity
                const isCreatingProperty = valueType?.id === SystemIds.PROPERTY;

                if (isCreatingProperty) {
                  // Use the proper property creation flow which sets dataType correctly
                  const renderableType = result.renderableType || 'TEXT';
                  const { baseDataType, renderableTypeId } = mapPropertyType(renderableType);
                  storage.properties.create({
                    entityId: result.id,
                    spaceId,
                    name: result.name ?? '',
                    dataType: baseDataType,
                    renderableTypeId,
                    verified: result.verified,
                    toSpaceId: result.space,
                  });
                } else {
                  // Standard entity creation
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

  // Check if we should show a map for Address or Venue properties
  const shouldShowMap = (propertyId === ADDRESS_PROPERTY || propertyId === VENUE_PROPERTY) && relations.length > 0;
  const firstRelation = relations[0];

  // Determine file accept type for upload
  const fileAccept =
    property.renderableTypeStrict === 'VIDEO'
      ? 'video/mp4,video/quicktime,video/x-msvideo,video/x-ms-wmv,video/webm,video/x-flv'
      : 'image/png,image/jpeg';

  return (
    <div className="flex flex-wrap items-center gap-1 pr-1">
      {/* Hidden file input for upload */}
      <input ref={fileInputRef} type="file" accept={fileAccept} onChange={handleFileInputChange} className="hidden" />

      {property.renderableTypeStrict === 'IMAGE' ? (
        relations.map(r => {
          const relationId = r.id;
          const relationValue = r.toEntity.id;

          return (
            <ImageRelationChipWrapper
              key={`relation-${relationId}-${relationValue}`}
              relation={r}
              spaceId={spaceId}
              isUploading={isUploading}
              onDelete={() => storage.relations.delete(r)}
              onDone={result => {
                storage.relations.update(r, draft => {
                  draft.toSpaceId = result.space;
                  draft.verified = result.verified;
                });
              }}
              onUpload={triggerFileUpload}
            />
          );
        })
      ) : property.renderableTypeStrict === 'VIDEO' ? (
        relations.map(r => {
          const relationId = r.id;
          const relationValue = r.toEntity.id;

          return (
            <VideoRelationChipWrapper
              key={`relation-${relationId}-${relationValue}`}
              relation={r}
              spaceId={spaceId}
              isUploading={isUploading}
              onDelete={() => storage.relations.delete(r)}
              onDone={result => {
                storage.relations.update(r, draft => {
                  draft.toSpaceId = result.space;
                  draft.verified = result.verified;
                });
              }}
              onUpload={triggerFileUpload}
            />
          );
        })
      ) : (
        <ReorderableRelationChipsDnd
          relations={relations}
          spaceId={spaceId}
          onUpdateRelation={(relation: Relation, newPosition: string | null) => {
            storage.relations.update(relation, draft => {
              if (newPosition) draft.position = newPosition;
            });
          }}
        />
      )}

      {property.renderableType !== SystemIds.IMAGE && property.renderableTypeStrict !== 'VIDEO' && (
        <div>
          <SelectEntityAsPopover
            trigger={
              isType ? (
                <AddTypeButton icon={<Create className="h-3 w-3" color="grey-04" />} label="type" />
              ) : (
                <SquareButton icon={<Create />} />
              )
            }
            placeholder={isType ? 'Find or create type...' : undefined}
            relationValueTypes={relationValueTypes ? relationValueTypes : undefined}
            onCreateEntity={result => {
              // Check if we're creating a Property entity
              const isCreatingProperty = valueType?.id === SystemIds.PROPERTY;

              if (isCreatingProperty) {
                // Use the proper property creation flow which sets dataType correctly
                const renderableType = result.renderableType || 'TEXT';
                const { baseDataType, renderableTypeId } = mapPropertyType(renderableType);
                storage.properties.create({
                  entityId: result.id,
                  spaceId,
                  name: result.name ?? '',
                  dataType: baseDataType,
                  renderableTypeId,
                  verified: result.verified,
                  toSpaceId: result.space,
                });
              } else {
                // Standard entity creation
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

      {/* Show geo location map for the first Address or Venue relation */}
      {shouldShowMap && firstRelation && (
        <GeoLocationWrapper
          relationId={firstRelation.id}
          id={firstRelation.toEntity.id}
          spaceId={firstRelation.toSpaceId || spaceId}
          propertyType={propertyId}
        />
      )}
    </div>
  );
}

function ImageRelation({ relationValue, spaceId }: { relationValue: string; spaceId: string }) {
  // Use the efficient hook to get only the image URL for this specific entity
  const actualImageSrc = useImageUrlFromEntity(relationValue, spaceId);

  return <ImageZoom imageSrc={actualImageSrc || ''} />;
}

// Wrapper component for image relations in edit mode
function ImageRelationChipWrapper({
  relation,
  spaceId,
  isUploading,
  onDelete,
  onDone,
  onUpload,
}: {
  relation: Relation;
  spaceId: string;
  isUploading?: boolean;
  onDelete: () => void;
  onDone: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
  onUpload: () => void;
}) {
  const entityId = relation.toEntity.id;
  const imageSrc = useImageUrlFromEntity(entityId, spaceId);

  return (
    <LinkableMediaChip
      isEditing
      mediaType="IMAGE"
      mediaSrc={imageSrc}
      isUploading={isUploading}
      currentSpaceId={spaceId}
      entityId={entityId}
      spaceId={relation.toSpaceId}
      relationId={relation.id}
      relationEntityId={relation.entityId}
      verified={relation.verified}
      onDelete={onDelete}
      onDone={onDone}
      onUpload={onUpload}
    />
  );
}

// Wrapper component for video relations in edit mode
function VideoRelationChipWrapper({
  relation,
  spaceId,
  isUploading,
  onDelete,
  onDone,
  onUpload,
}: {
  relation: Relation;
  spaceId: string;
  isUploading?: boolean;
  onDelete: () => void;
  onDone: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
  onUpload: () => void;
}) {
  const entityId = relation.toEntity.id;
  const videoSrc = useVideoUrlFromEntity(entityId, spaceId);

  return (
    <LinkableMediaChip
      isEditing
      mediaType="VIDEO"
      mediaSrc={videoSrc}
      isUploading={isUploading}
      currentSpaceId={spaceId}
      entityId={entityId}
      spaceId={relation.toSpaceId}
      relationId={relation.id}
      relationEntityId={relation.entityId}
      verified={relation.verified}
      onDelete={onDelete}
      onDone={onDone}
      onUpload={onUpload}
    />
  );
}

function RenderedValue({
  entityId,
  propertyId,
  spaceId,
  property: propProperty,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  property: Property;
}) {
  const { storage } = useMutate();
  const { property: queriedProperty } = useQueryProperty({ id: propertyId });

  const property = propProperty || queriedProperty;

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

  const onDelete = () => {
    if (rawValue) {
      storage.values.delete(rawValue);
    }
  };

  const renderField = () => {
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
              shouldDebounce={true}
            />
            {property.id === FORMAT_PROPERTY && (
              <SuggestedFormats entityId={entityId} spaceId={spaceId} value={value} onChange={onChange} />
            )}
          </>
        );
      }
      case 'INT64':
      case 'FLOAT64':
      case 'DECIMAL':
        return (
          <NumberField
            key={propertyId}
            isEditing={true}
            value={value}
            format={property.format || undefined}
            unitId={options?.unit || property.unit || undefined}
            onChange={onChange}
          />
        );
      case 'BOOL': {
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
      case 'DATE':
      case 'DATETIME':
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
            {property.renderableTypeStrict === 'GEO_LOCATION' ? (
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
  };

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">{renderField()}</div>
      <div className="flex shrink-0 items-center gap-1">
        <DataTypePill
          dataType={property.dataType}
          renderableType={
            property.renderableTypeStrict
              ? { id: property.renderableType ?? null, name: property.renderableTypeStrict }
              : null
          }
          spaceId={spaceId}
          iconOnly={true}
        />
        {rawValue && <SquareButton icon={<Trash />} onClick={onDelete} />}
      </div>
    </div>
  );
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

// System properties that are editable elsewhere
const SYSTEM_PROPERTIES = [
  SystemIds.NAME_PROPERTY,
  SystemIds.TYPES_PROPERTY,
  SystemIds.COVER_PROPERTY,
  SystemIds.BLOCKS,
  ContentIds.AVATAR_PROPERTY,
  DATA_TYPE_PROPERTY,
  VALUE_TYPE_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
];

/**
 * Returns filtered property entries excluding system properties and
 * IS_TYPE_PROPERTY for non-relation properties.
 */
function useVisiblePropertiesEntries(entityId: string, spaceId: string): [string, Property][] {
  const renderedProperties = useEditableProperties(entityId, spaceId);
  const propertiesEntries = Object.entries(renderedProperties);

  const { property: propertyData } = useQueryProperty({
    id: entityId,
    spaceId,
    enabled: true,
  });

  const isNonRelationProperty = propertyData && propertyData.dataType !== 'RELATION';

  const visibleEntries = propertiesEntries.filter(([propertyId]) => {
    // Hide system properties and IS_TYPE_PROPERTY for non-relation properties
    if (SYSTEM_PROPERTIES.includes(propertyId)) return false;
    if (propertyId === IS_TYPE_PROPERTY && isNonRelationProperty) return false;
    return true;
  });

  return visibleEntries;
}

/**
 * Returns true if the properties panel should be visible.
 * Panel shows when entity has name, content, types, or non-system properties.
 */
function useShouldShowPropertiesPanel(entityId: string, spaceId: string): boolean {
  const name = useName(entityId, spaceId);
  const types = useEntityTypes(entityId, spaceId);

  const { blockIds } = useEditorStore();
  const [editorHasContent] = useAtom(editorHasContentAtom);

  const values = useValues({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && !SYSTEM_PROPERTIES.includes(v.property.id),
  });

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && !SYSTEM_PROPERTIES.includes(r.type.id),
  });

  const hasActualProperties = values.length > 0 || relations.length > 0;

  const shouldShow =
    (name !== null && name.length > 0) ||
    (blockIds && blockIds.length > 0) ||
    editorHasContent ||
    types.length > 0 ||
    hasActualProperties;

  return shouldShow;
}
