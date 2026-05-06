'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import {
  DATA_TYPE_PROPERTY,
  FORMAT_PROPERTY,
  IS_TYPE_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  SCORE_SYSTEM_PROPERTY,
  VALUE_TYPE_PROPERTY,
} from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useEditableProperties } from '~/core/hooks/use-renderables';
import { useEntitySchema, useName, useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryProperty, useRelations, useValue } from '~/core/sync/use-store';
import type { Property, ValueOptions } from '~/core/types';
import { isUrlTemplate, resolveUrlTemplate } from '~/core/utils/url-template';

import { propertyNameMatchesSkills } from '~/atoms/personal-profile-suggested';
import { Accordion } from '~/design-system/accordion';
import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { DateField } from '~/design-system/editable-fields/date-field';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationPointFields } from '~/design-system/editable-fields/geo-location-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { ScheduleField } from '~/design-system/editable-fields/schedule-field';
import { Create } from '~/design-system/icons/create';
import { Trash } from '~/design-system/icons/trash';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import SuggestedFormats from '~/design-system/suggested-formats-window';
import { Text } from '~/design-system/text';

import { DataTypePill } from '~/partials/entity-page/data-type-pill';
import { RelationsGroup } from '~/partials/entity-page/editable-entity-page';
import { PropertyNameLink } from '~/partials/entity-page/property-name-link';

type EditablePostEntityPageProps = {
  id: string;
  spaceId: string;
};

export function EditablePostEntityPage({ id, spaceId }: EditablePostEntityPageProps) {
  const { createProperty, addPropertyToEntity } = useCreateProperty(spaceId);

  const name = useName(id, spaceId);
  const shouldShowPanel = useShouldShowPropertiesPanel(id, spaceId);
  const visiblePropertiesEntries = useVisiblePropertiesEntries(id, spaceId);

  const relationEntityRelations = useRelationEntityRelations(id, spaceId);
  const isRelationPage = relationEntityRelations.length > 0;

  const schemaProperties = useEntitySchema(id, spaceId);
  const schemaPropertyIds = React.useMemo(() => new Set(schemaProperties.map(p => p.id)), [schemaProperties]);

  const showPanel = shouldShowPanel || isRelationPage;

  return (
    <AnimatePresence initial={false}>
      {showPanel && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative rounded-lg border border-grey-02 shadow-button"
        >
          <Accordion type="single" defaultValue="post-information" collapsible className="w-full">
            <Accordion.Item value="post-information" className="border-none">
              <Accordion.Trigger className="px-5 py-4">
                <Text as="span" variant="body">
                  Post information
                </Text>
              </Accordion.Trigger>
              <Accordion.Content className="border-t border-grey-02 px-0 pt-0 [&>div]:pb-5">
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
                    placeholder="Find or create property..."
                    advanced={false}
                    showIDs={false}
                  />
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RenderedProperty({ property, spaceId }: { property: Property; spaceId: string }) {
  return <PropertyNameLink property={property} spaceId={spaceId} />;
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

  const propertyValue = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  return (
    <div
      className="flex items-start justify-between gap-2"
      {...(propertyNameMatchesSkills(property.name ?? '')
        ? { 'data-personal-profile-focus': 'skills' as const }
        : {})}
    >
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
        {(!isSchemaProperty || propertyRelations.length > 0) && (
          <SquareButton
            icon={<Trash />}
            onClick={() => {
              storage.relations.deleteMany(propertyRelations);
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
    if (SYSTEM_PROPERTIES.includes(propertyId)) return false;
    if (propertyId === IS_TYPE_PROPERTY && isNonRelationProperty) return false;
    return true;
  });

  return visibleEntries;
}

function useShouldShowPropertiesPanel(_entityId: string, _spaceId: string): boolean {
  return true;
}
