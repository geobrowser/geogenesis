'use client';

import { ContentIds, IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import {
  DATA_TYPE_PROPERTY,
  FORMAT_PROPERTY,
  IS_TYPE_PROPERTY,
  PROPERTY_GROUPS_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  SCORE_SYSTEM_PROPERTY,
  VALUE_TYPE_PROPERTY,
} from '~/core/constants';
import { ADDRESS_PROPERTY, VENUE_PROPERTY } from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useEditableProperties } from '~/core/hooks/use-renderables';
import { ID } from '~/core/id';
import {
  useEntitySchema,
  useEntitySchemaWithGroups,
  useEntityTypes,
  useName,
  useRelationEntityRelations,
} from '~/core/state/entity-page-store/entity-store';
import { Mutator, useMutate } from '~/core/sync/use-mutate';
import { useQueryProperty, useRelations, useValue } from '~/core/sync/use-store';
import { Property, Relation, ValueOptions } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';
import { isUrlTemplate, resolveUrlTemplate } from '~/core/utils/url-template';
import { useImageUrlFromEntity, useVideoUrlFromEntity } from '~/core/utils/use-entity-media';
import { sortRelations } from '~/core/utils/utils';

import { propertyIsSkillsProperty } from '~/atoms/personal-profile-suggested';
import { AddTypeButton, SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableMediaChip } from '~/design-system/chip';
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
import { ScheduleField } from '~/design-system/editable-fields/schedule-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { InputPlace } from '~/design-system/input-address';
import ReorderableRelationChipsDnd from '~/design-system/reorderable-relation-chips-dnd';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import SuggestedFormats from '~/design-system/suggested-formats-window';
import { Text } from '~/design-system/text';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { createRelationEntityTypeRelation } from '~/partials/blocks/table/change-entry';
import { DataTypePill } from '~/partials/entity-page/data-type-pill';
import { PropertyNameLink } from '~/partials/entity-page/property-name-link';
import { TYPE_ICONS, resolveRenderableTypeKey } from '~/partials/entity-page/type-icons';
import { TypePropertyGroupsEditor } from '~/partials/entity-page/type-property-groups-editor';
import { getEntityTemplate } from '~/partials/entity-page/utils/get-entity-template';

type EditableEntityPageProps = {
  id: string;
  spaceId: string;
};

export function EditableEntityPage({ id, spaceId }: EditableEntityPageProps) {
  const { createProperty, addPropertyToEntity } = useCreateProperty(spaceId);
  const { storage } = useMutate();

  const name = useName(id, spaceId);
  const entityTypes = useEntityTypes(id, spaceId);
  const isTypeEntity = entityTypes.some(type => type.id === SystemIds.SCHEMA_TYPE);
  const typePropertyRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === id && relation.spaceId === spaceId && relation.type.id === SystemIds.PROPERTIES,
    })
  );
  const addPropertyToType = React.useCallback(
    (property: { id: string; name: string | null }) => {
      const alreadyExists = typePropertyRelations.some(relation => relation.toEntity.id === property.id);
      if (alreadyExists) return;

      const lastPosition = typePropertyRelations.at(-1)?.position ?? null;
      storage.relations.set({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId,
        renderableType: 'RELATION',
        verified: false,
        position: Position.generateBetween(lastPosition, null),
        type: {
          id: SystemIds.PROPERTIES,
          name: 'Properties',
        },
        fromEntity: {
          id,
          name: name ?? null,
        },
        toEntity: {
          id: property.id,
          name: property.name,
          value: property.id,
        },
      });
    },
    [id, name, spaceId, storage.relations, typePropertyRelations]
  );
  const visiblePropertySections = useVisiblePropertySections(id, spaceId);
  const visibleFlatPropertiesEntries = useVisiblePropertiesEntries(id, spaceId, {
    hideTypeGroupingFields: isTypeEntity,
  });
  const effectiveSections = isTypeEntity
    ? [
        {
          id: 'type-flat-properties',
          isGroup: false,
          defaultCollapsed: false,
          entries: visibleFlatPropertiesEntries,
        } satisfies VisiblePropertySection,
      ]
    : visiblePropertySections.sections;
  const effectiveHasGroups = !isTypeEntity && visiblePropertySections.hasGroups;
  const effectiveTotalProperties = isTypeEntity ? visibleFlatPropertiesEntries.length : visiblePropertySections.totalProperties;
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const [typePropertiesCollapsed, setTypePropertiesCollapsed] = React.useState(false);

  React.useEffect(() => {
    const defaults: Record<string, boolean> = {};
    for (const section of visiblePropertySections.sections) {
      if (!section.groupId || !section.isGroup) continue;
      defaults[section.groupId] = section.defaultCollapsed;
    }

    setCollapsedGroups(previous => {
      const next: Record<string, boolean> = {};
      for (const [groupId, defaultCollapsed] of Object.entries(defaults)) {
        next[groupId] = previous[groupId] ?? defaultCollapsed;
      }

      const sameKeys = Object.keys(previous).length === Object.keys(next).length;
      const sameValues = Object.entries(next).every(([groupId, value]) => previous[groupId] === value);
      return sameKeys && sameValues ? previous : next;
    });
  }, [effectiveSections]);

  // Get schema properties from the entity's types - these are placeholders that can't be deleted
  const schemaProperties = useEntitySchema(id, spaceId);
  const schemaPropertyIds = React.useMemo(() => new Set(schemaProperties.map(p => p.id)), [schemaProperties]);

  const showPanel = true;

  return (
    <AnimatePresence initial={false}>
      {showPanel && (
        <div className="flex flex-col gap-6">
          {isTypeEntity && <TypePropertyGroupsEditor entityId={id} spaceId={spaceId} />}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative rounded-lg border border-grey-02 shadow-button"
          >
            <div className={isTypeEntity ? 'flex flex-col gap-3 p-4' : 'flex flex-col gap-6 p-5'}>
              {isTypeEntity && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-tableCell text-grey-04"
                  onClick={() => setTypePropertiesCollapsed(previous => !previous)}
                >
                  <span>Type properties</span>
                  <div className={typePropertiesCollapsed ? '-rotate-90 transition-transform' : 'transition-transform'}>
                    <ChevronDownSmall color="grey-04" />
                  </div>
                </button>
              )}
              {effectiveTotalProperties === 0 && (
                <div className="flex flex-col items-center justify-center text-center">
                  <Text as="p" variant="body" color="grey-04">
                    No properties added yet
                  </Text>
                  <Text as="p" variant="footnote" color="grey-03" className="mt-1">
                    Click the + button below to add properties
                  </Text>
                </div>
              )}
              {effectiveSections.map(section => {
                const sectionCollapsed = section.groupId ? (collapsedGroups[section.groupId] ?? section.defaultCollapsed) : false;
                const isCollapsed = isTypeEntity ? typePropertiesCollapsed : sectionCollapsed;

                return (
                  <div key={section.id} className={isTypeEntity ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}>
                    {effectiveHasGroups && section.isGroup && (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left"
                        onClick={() =>
                          section.groupId &&
                          setCollapsedGroups(previous => ({
                            ...previous,
                            [section.groupId as string]: !sectionCollapsed,
                          }))
                        }
                      >
                        <Text as="p" variant="tableCell" className="font-medium">
                          {section.label}
                        </Text>
                        <div className={sectionCollapsed ? '' : 'rotate-180'}>
                          <ChevronDownSmall color="grey-04" />
                        </div>
                      </button>
                    )}

                    {!isCollapsed &&
                      section.entries.map(([propertyId, property]) => {
                        const isRelation = property.dataType === 'RELATION' || property.renderableType === 'IMAGE';
                        const isVideo = property.renderableType === 'VIDEO' || property.renderableTypeStrict === 'VIDEO';

                        if (isTypeEntity) {
                          return (
                            <TypeEntityPropertyRow
                              key={`${id}-${propertyId}`}
                              entityId={id}
                              propertyId={propertyId}
                              spaceId={spaceId}
                              property={property}
                              isSchemaProperty={schemaPropertyIds.has(propertyId)}
                              isRelation={isRelation}
                              isVideo={isVideo}
                            />
                          );
                        }

                        return (
                          <div key={`${id}-${propertyId}`} className="w-full max-w-full min-w-0 break-words">
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
                );
              })}
            </div>
            <div className={effectiveTotalProperties === 0 ? 'absolute bottom-0 left-0 p-4' : 'p-4'}>
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

                  if (isTypeEntity) {
                    addPropertyToType({ id: createdPropertyId, name: result.name || '' });
                  } else {
                    // Immediately add the property to the entity
                    addPropertyToEntity({
                      entityId: id,
                      propertyId: createdPropertyId,
                      propertyName: result.name || '',
                      entityName: name || undefined,
                    });
                  }

                  return createdPropertyId;
                }}
                onDone={result => {
                  if (result) {
                    if (isTypeEntity) {
                      addPropertyToType({ id: result.id, name: result.name });
                    } else {
                      addPropertyToEntity({
                        entityId: id,
                        propertyId: result.id,
                        propertyName: result.name || '',
                        entityName: name || undefined,
                      });
                    }
                  }
                }}
                placeholder="Find or create property..."
                advanced={false}
                showIDs={false}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export const EditableEntityProperties = EditableEntityPage;

function RenderedProperty({ property, spaceId }: { property: Property; spaceId: string }) {
  return <PropertyNameLink property={property} spaceId={spaceId} />;
}

function TypeEntityPropertyRow({
  entityId,
  propertyId,
  spaceId,
  property,
  isSchemaProperty,
  isRelation,
  isVideo,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  property: Property;
  isSchemaProperty: boolean;
  isRelation: boolean;
  isVideo: boolean;
}) {
  return (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-4">
      <div className="inline-flex min-w-0 items-center gap-2 text-text">
        <InlinePropertyTypeIcon dataType={property.dataType} renderableType={property.renderableTypeStrict ?? property.renderableType} />
        <span className="truncate text-tableCell font-medium">{property.name}</span>
      </div>
      <div className="min-w-0">
        {isRelation || isVideo ? (
          <RelationPropertyWithDelete
            propertyId={propertyId}
            entityId={entityId}
            spaceId={spaceId}
            property={property}
            isSchemaProperty={isSchemaProperty}
            hideActions
          />
        ) : (
          <RenderedValue propertyId={propertyId} entityId={entityId} spaceId={spaceId} property={property} hideActions />
        )}
      </div>
    </div>
  );
}

function InlinePropertyTypeIcon({ dataType, renderableType }: { dataType: Property['dataType']; renderableType?: string | null }) {
  const iconKey = resolveRenderableTypeKey(renderableType, renderableType) ?? (dataType in TYPE_ICONS ? dataType : 'TEXT');
  if (iconKey === 'RELATION') {
    return (
      <span className="inline-flex items-center p-0.5 text-text">
        <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="9.5" r="5" stroke="currentColor" strokeWidth="1.5"></circle>
          <circle cx="12" cy="9.5" r="5" stroke="currentColor" strokeWidth="1.5"></circle>
        </svg>
      </span>
    );
  }

  const Icon = TYPE_ICONS[iconKey];
  return (
    <span className="inline-flex items-center text-text [&_svg]:size-4">
      <Icon color="text" />
    </span>
  );
}

type RelationPropertyWithDeleteProps = {
  propertyId: string;
  entityId: string;
  spaceId: string;
  property: Property;
  isSchemaProperty: boolean;
  hideActions?: boolean;
};

type VisiblePropertySection = {
  id: string;
  groupId?: string;
  isGroup: boolean;
  label?: string;
  defaultCollapsed: boolean;
  entries: [string, Property][];
};

function useVisiblePropertiesEntries(
  entityId: string,
  spaceId: string,
  options?: { hideTypeGroupingFields?: boolean }
): [string, Property][] {
  const renderedProperties = useEditableProperties(entityId, spaceId);
  const propertiesEntries = Object.entries(renderedProperties);

  const { property: propertyData } = useQueryProperty({
    id: entityId,
    spaceId,
    enabled: true,
  });

  const isNonRelationProperty = propertyData && propertyData.dataType !== 'RELATION';

  return propertiesEntries.filter(([propertyId]) => {
    if (SYSTEM_PROPERTIES.includes(propertyId)) return false;
    if (propertyId === IS_TYPE_PROPERTY && isNonRelationProperty) return false;
    if (options?.hideTypeGroupingFields && (propertyId === SystemIds.PROPERTIES || propertyId === PROPERTY_GROUPS_PROPERTY)) {
      return false;
    }
    return true;
  });
}

function RelationPropertyWithDelete({
  propertyId,
  entityId,
  spaceId,
  property,
  isSchemaProperty,
  hideActions = false,
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
    <div
      className="flex items-start justify-between gap-2"
      {...(propertyIsSkillsProperty(property.id)
        ? { 'data-personal-profile-focus': 'skills' as const }
        : {})}
    >
      <div className="min-w-0 flex-1">
        <RelationsGroup key={propertyId} propertyId={propertyId} id={entityId} spaceId={spaceId} />
      </div>
      {!hideActions && (
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
                // Batch-delete all relations for this property in a single store update
                storage.relations.deleteMany(propertyRelations);
                // Also delete the value entry to fully remove the property from the entity
                if (propertyValue) {
                  storage.values.delete(propertyValue);
                }
              }}
            />
          )}
        </div>
      )}
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
      <div className="flex w-full max-w-full min-w-0 flex-wrap items-center gap-1 pr-1">
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
                      toSpaceId: valueType.spaceId,
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

                const toSpaceId = result.space ?? result.primarySpace;
                if (toSpaceId) {
                  newRelation.toSpaceId = toSpaceId;
                }

                if (result.verified) {
                  newRelation.verified = true;
                }

                storage.relations.set(newRelation);

                for (const relationType of property.relationEntityTypes ?? []) {
                  createRelationEntityTypeRelation(storage, spaceId, newEntityId, relationType);
                }

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
    <div className="flex w-full max-w-full min-w-0 flex-wrap items-center gap-1 pr-1">
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
                    toSpaceId: valueType.spaceId,
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

              for (const relationType of property.relationEntityTypes ?? []) {
                createRelationEntityTypeRelation(storage, spaceId, newEntityId, relationType);
              }

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
  hideActions = false,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  property: Property;
  hideActions?: boolean;
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
      draft.property.dataType = property.dataType;
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
        const hasUrlTemplate = isUrlTemplate(property.format);
        const resolvedUrl = hasUrlTemplate ? resolveUrlTemplate(property.format, value) : undefined;
        return (
          <>
            <PageStringField
              key={propertyId}
              variant="tableCell"
              placeholder="Add value..."
              aria-label="text-field"
              value={value}
              onChange={onChange}
            />
            {property.id === FORMAT_PROPERTY && (
              <SuggestedFormats entityId={entityId} spaceId={spaceId} value={value} onChange={onChange} />
            )}
            {hasUrlTemplate && value && <span className="text-sm text-grey-04">Resolved URL · {resolvedUrl}</span>}
          </>
        );
      }
      case 'INTEGER':
      case 'FLOAT':
      case 'DECIMAL':
        return (
          <NumberField
            key={propertyId}
            isEditing={true}
            value={value}
            format={property.format || undefined}
            unitId={options?.unit || property.unit || undefined}
            onChange={onChange}
            dataType={property.dataType}
          />
        );
      case 'BOOLEAN': {
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
            dataType={property.dataType}
          />
        );
      }

      case 'SCHEDULE': {
        return <ScheduleField key={propertyId} isEditing={true} value={value} onChange={onChange} />;
      }

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
                variant="tableCell"
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
    <div className="flex w-full items-start justify-between gap-2">
      <div className="min-w-0 flex-1">{renderField()}</div>
      {!hideActions && (
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
      )}
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
  SystemIds.DESCRIPTION_PROPERTY,
  SystemIds.TYPES_PROPERTY,
  SystemIds.COVER_PROPERTY,
  SystemIds.BLOCKS,
  SystemIds.TABS_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  DATA_TYPE_PROPERTY,
  VALUE_TYPE_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  SCORE_SYSTEM_PROPERTY,
];

function useVisiblePropertySections(
  entityId: string,
  spaceId: string
): { sections: VisiblePropertySection[]; hasGroups: boolean; totalProperties: number } {
  const schemaWithGroups = useEntitySchemaWithGroups(entityId, spaceId);
  const visibleEntries = useVisiblePropertiesEntries(entityId, spaceId);

  if (!schemaWithGroups.hasPropertyGroups) {
    return {
      hasGroups: false,
      totalProperties: visibleEntries.length,
      sections: [
        {
          id: 'ungrouped-flat',
          isGroup: false,
          defaultCollapsed: false,
          entries: visibleEntries,
        },
      ],
    };
  }

  const visibleById = new Map(visibleEntries);
  const consumed = new Set<string>();

  const groupedSections: VisiblePropertySection[] = schemaWithGroups.propertyGroups.map(group => {
    const entries: [string, Property][] = [];
    for (const propertyId of group.propertyIds) {
      if (consumed.has(propertyId)) continue;
      const property = visibleById.get(propertyId);
      if (!property) continue;
      consumed.add(propertyId);
      entries.push([propertyId, property]);
    }

    return {
      id: `group-${group.id}`,
      groupId: group.id,
      isGroup: true,
      label: group.name?.trim() || 'Add name...',
      defaultCollapsed: group.collapsed,
      entries,
    };
  });

  const ungroupedEntries: [string, Property][] = [];
  for (const propertyId of schemaWithGroups.ungroupedPropertyIds) {
    if (consumed.has(propertyId)) continue;
    const property = visibleById.get(propertyId);
    if (!property) continue;
    consumed.add(propertyId);
    ungroupedEntries.push([propertyId, property]);
  }

  for (const [propertyId, property] of visibleEntries) {
    if (consumed.has(propertyId)) continue;
    consumed.add(propertyId);
    ungroupedEntries.push([propertyId, property]);
  }

  return {
    hasGroups: true,
    totalProperties: visibleEntries.length,
    sections: [
      ...groupedSections,
      {
        id: 'ungrouped',
        isGroup: true,
        groupId: 'ungrouped',
        label: 'Ungrouped properties',
        defaultCollapsed: false,
        entries: ungroupedEntries,
      },
    ],
  };
}
