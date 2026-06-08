'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';

import {
  ADDRESS_PROPERTY,
  DATA_TYPE_PROPERTY,
  PROPERTY_GROUPS_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  SCORE_SYSTEM_PROPERTY,
  VENUE_PROPERTY,
} from '~/core/constants';
import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useEntitySchemaWithGroups, useEntityTypes } from '~/core/state/entity-page-store/entity-store';
import {
  useHydrateEntity,
  useQueryEntity,
  useQueryProperty,
  useRelations,
  useValue,
  useValues,
} from '~/core/sync/use-store';
import { DataType, RenderableType } from '~/core/types';
import { isUrlTemplate } from '~/core/utils/url-template';
import { useImageUrlFromEntity, useVideoUrlFromEntity } from '~/core/utils/use-entity-media';
import { GeoNumber, GeoPoint, sortRelations } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, VideoThumbnailWithPlay } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationWrapper } from '~/design-system/editable-fields/geo-location-field';
import { ScheduleField } from '~/design-system/editable-fields/schedule-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Map as GeoMap } from '~/design-system/map';
import { Text } from '~/design-system/text';

import { PropertyNameLink } from '~/partials/entity-page/property-name-link';

interface Props {
  id: string;
  spaceId: string;
}

const SKIPPED_PROPERTIES: string[] = [
  SystemIds.TYPES_PROPERTY,
  SystemIds.NAME_PROPERTY,
  SystemIds.DESCRIPTION_PROPERTY,
  SystemIds.COVER_PROPERTY,
  SystemIds.TABS_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  DATA_TYPE_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
  SCORE_SYSTEM_PROPERTY,
];

function useReadableSkippedPropertyIds(entityId: string, spaceId: string): Set<string> {
  const entityTypes = useEntityTypes(entityId, spaceId);
  const isTypeEntity = entityTypes.some(type => type.id === SystemIds.SCHEMA_TYPE);

  return React.useMemo(() => {
    const skipped = new Set(SKIPPED_PROPERTIES);
    if (isTypeEntity) {
      skipped.add(SystemIds.PROPERTIES);
      skipped.add(PROPERTY_GROUPS_PROPERTY);
    }
    return skipped;
  }, [isTypeEntity]);
}

function countRenderableProperty(renderedProperties: string[], skippedPropertyIds: Set<string>): number {
  let count = 0;
  renderedProperties.forEach(propertyId => {
    if (!skippedPropertyIds.has(propertyId)) {
      count++;
    }
  });
  return count;
}

export function useReadableEntityHasContent(entityId: string, spaceId: string): boolean {
  const renderedProperties = useRenderedPropertiesWithContent(entityId, spaceId);
  const skippedPropertyIds = useReadableSkippedPropertyIds(entityId, spaceId);
  return countRenderableProperty(Object.keys(renderedProperties), skippedPropertyIds) > 0;
}

export function ReadableEntityPage({ id, spaceId }: Props) {
  const hasContent = useReadableEntityHasContent(id, spaceId);

  if (!hasContent) {
    return null;
  }

  return <ReadableEntityProperties id={id} spaceId={spaceId} />;
}

export function ReadableEntityProperties({ id: entityId, spaceId }: Props) {
  const renderedProperties = useRenderedPropertiesWithContent(entityId, spaceId);
  const schemaWithGroups = useEntitySchemaWithGroups(entityId, spaceId);
  const skippedPropertyIds = useReadableSkippedPropertyIds(entityId, spaceId);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const defaults: Record<string, boolean> = {};
    for (const group of schemaWithGroups.propertyGroups) {
      defaults[group.id] = group.collapsed;
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
  }, [schemaWithGroups.propertyGroups]);

  const groupedSections = React.useMemo(() => {
    const visiblePropertyIds = new Set(
      Object.keys(renderedProperties).filter(propertyId => !skippedPropertyIds.has(propertyId))
    );

    if (!schemaWithGroups.hasPropertyGroups) {
      return {
        hasGroups: false,
        groups: [] as { id: string; label: string; propertyIds: string[] }[],
        ungrouped: [...visiblePropertyIds.values()],
      };
    }

    const consumed = new Set<string>();
    const groups = schemaWithGroups.propertyGroups
      .map(group => {
        const propertyIds = group.propertyIds.filter(propertyId => {
          if (!visiblePropertyIds.has(propertyId) || consumed.has(propertyId)) return false;
          consumed.add(propertyId);
          return true;
        });
        return {
          id: group.id,
          label: group.name?.trim() || 'Untitled group',
          propertyIds,
        };
      })
      .filter(group => group.propertyIds.length > 0);

    const orderedUngrouped: string[] = [];
    for (const propertyId of schemaWithGroups.ungroupedPropertyIds) {
      if (!visiblePropertyIds.has(propertyId) || consumed.has(propertyId)) continue;
      consumed.add(propertyId);
      orderedUngrouped.push(propertyId);
    }

    for (const propertyId of visiblePropertyIds) {
      if (consumed.has(propertyId)) continue;
      consumed.add(propertyId);
      orderedUngrouped.push(propertyId);
    }

    return {
      hasGroups: true,
      groups,
      ungrouped: orderedUngrouped,
    };
  }, [renderedProperties, schemaWithGroups, skippedPropertyIds]);

  if (countRenderableProperty(Object.keys(renderedProperties), skippedPropertyIds) <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {groupedSections.hasGroups &&
        groupedSections.groups.map(group => {
          const isCollapsed = collapsedGroups[group.id] ?? false;
          return (
            <div key={group.id} className="flex flex-col gap-2">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() =>
                  setCollapsedGroups(previous => ({
                    ...previous,
                    [group.id]: !isCollapsed,
                  }))
                }
              >
                <Text as="p" variant="metadata" className="leading-[13px] tracking-[-0.35px] text-grey-04">
                  {group.label}
                </Text>
                <div className={cx(isCollapsed && '-rotate-90', 'transition-transform')}>
                  <ChevronDownSmall color="grey-04" />
                </div>
              </button>

              {!isCollapsed && (
                <div className="flex flex-col gap-6">
                  {group.propertyIds.map(propertyId => {
                    const property = renderedProperties[propertyId];
                    if (!property) return null;
                    const isRelation = property.dataType === 'RELATION';

                    if (isRelation) {
                      return (
                        <RelationsGroup
                          key={propertyId}
                          entityId={entityId}
                          spaceId={spaceId}
                          propertyId={propertyId}
                        />
                      );
                    }

                    return (
                      <ValuesGroup key={propertyId} entityId={entityId} propertyId={propertyId} spaceId={spaceId} />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {groupedSections.ungrouped.length > 0 && (
        <div className="flex flex-col gap-2">
          {groupedSections.hasGroups && (
            <Text as="p" variant="metadata" className="leading-[13px] tracking-[-0.35px] text-grey-04">
              Ungrouped properties
            </Text>
          )}
          <div className="flex flex-col gap-6">
            {groupedSections.ungrouped.map(propertyId => {
              const property = renderedProperties[propertyId];
              if (!property) return null;
              const isRelation = property.dataType === 'RELATION';

              if (isRelation) {
                return (
                  <RelationsGroup key={propertyId} entityId={entityId} spaceId={spaceId} propertyId={propertyId} />
                );
              }

              return <ValuesGroup key={propertyId} entityId={entityId} propertyId={propertyId} spaceId={spaceId} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ReadableNumberField = ({ value, unitId, propertyId }: { value: string; unitId?: string; propertyId: string }) => {
  const { property } = useQueryProperty({ id: propertyId });

  // Use format and unit from the property directly
  const format = property?.format || undefined;
  const propertyUnitId = property?.unit || undefined;

  // Use unitId from value options if available, otherwise fall back to property unit
  const actualUnitId = unitId || propertyUnitId || undefined;
  const { entity: unitEntity } = useQueryEntity({ id: actualUnitId });

  const currencySign = React.useMemo(
    () => unitEntity?.values.find(t => t.property.id === SystemIds.CURRENCY_SIGN_PROPERTY)?.value || '',
    [unitEntity]
  );

  return <Text as="p">{GeoNumber.format(value, format, currencySign)}</Text>;
};

function ValuesGroup({ entityId, spaceId, propertyId }: { entityId: string; spaceId: string; propertyId: string }) {
  // @TODO: This should be prefetched with _all_ the properties
  const { property } = useQueryProperty({ id: propertyId });

  const values = useValues({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  if (!property) {
    return null;
  }

  // Filter out empty values - don't show properties with no content in browse mode
  const nonEmptyValues = values.filter(v => v.value);

  if (nonEmptyValues.length === 0) {
    return null;
  }

  return (
    <>
      {nonEmptyValues.map((t, index) => {
        // hide name property, it is already rendered in the header
        // @TODO: filter ahead of time rather than returning null here
        if (propertyId === SystemIds.NAME_PROPERTY) {
          return null;
        }
        return (
          <div key={`${entityId}-${propertyId}-${index}`} className="max-w-full min-w-0 break-words">
            <PropertyNameLink property={property} spaceId={spaceId} />
            <div className="flex w-full max-w-full min-w-0 flex-wrap gap-2">
              <RenderedValue
                propertyId={propertyId}
                entityId={entityId}
                spaceId={t.spaceId}
                renderableType={property.renderableTypeStrict ?? property.dataType}
                format={property.format}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

export function RelationsGroup({
  entityId,
  spaceId,
  propertyId,
  isMetadataHeader,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  isMetadataHeader?: boolean;
}) {
  const { property } = useQueryProperty({ id: propertyId });

  const relations = sortRelations(
    useRelations({
      selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === propertyId,
    })
  );

  if (relations.length === 0) {
    return null;
  }

  if (!property) {
    return null;
  }

  if (relations.length === 0) {
    return null;
  }

  // hide cover, avatar, and type properties
  // they are already rendered in the avatar cover component
  // unless this is the types group that is rendered in the header
  if (
    propertyId === SystemIds.COVER_PROPERTY ||
    propertyId === ContentIds.AVATAR_PROPERTY ||
    (propertyId === SystemIds.TYPES_PROPERTY && !isMetadataHeader) ||
    propertyId === SystemIds.TABS_PROPERTY ||
    propertyId === DATA_TYPE_PROPERTY ||
    propertyId === RENDERABLE_TYPE_PROPERTY
  ) {
    return null;
  }

  // Check if we should show a map for Address or Venue properties
  const shouldShowMap = (propertyId === ADDRESS_PROPERTY || propertyId === VENUE_PROPERTY) && relations.length > 0;
  const firstRelation = relations[0];

  return (
    <>
      <div key={`${propertyId}-${property.name}`} className="max-w-full min-w-0 break-words">
        {propertyId !== SystemIds.TYPES_PROPERTY && <PropertyNameLink property={property} spaceId={spaceId} />}

        <div className="flex w-full max-w-full min-w-0 flex-wrap gap-2">
          {relations.map(r => {
            const linkedEntityId = r.toEntity.id;
            const linkedSpaceId = r.toSpaceId ?? r.spaceId;
            const relationName = r.toEntity.name;
            const relationEntityId = r.entityId;
            const relationId = r.id;

            if (property.renderableTypeStrict === 'IMAGE') {
              return (
                <ImageRelation
                  key={`image-${relationId}-${linkedEntityId}`}
                  linkedEntityId={linkedEntityId}
                  directImageUrl={r.toEntity.value}
                  spaceId={spaceId}
                />
              );
            }

            if (property.renderableTypeStrict === 'VIDEO') {
              return (
                <VideoRelation
                  key={`video-${relationId}-${linkedEntityId}`}
                  linkedEntityId={linkedEntityId}
                  relationId={relationId}
                  spaceId={spaceId}
                />
              );
            }

            return (
              <div
                key={`relation-${relationId}-${linkedEntityId}`}
                className={cx('max-w-full min-w-0', !isMetadataHeader && 'mt-1')}
              >
                <LinkableRelationChip
                  isEditing={false}
                  currentSpaceId={spaceId}
                  entityId={linkedEntityId}
                  spaceId={linkedSpaceId}
                  relationEntityId={relationEntityId}
                  relationId={relationId}
                  small
                  truncateLabel
                >
                  {relationName ?? linkedEntityId}
                </LinkableRelationChip>
              </div>
            );
          })}
        </div>
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
    </>
  );
}

function ImageRelation({
  linkedEntityId,
  directImageUrl,
  spaceId,
}: {
  linkedEntityId: string;
  directImageUrl?: string | null;
  spaceId: string;
}) {
  // For published data, directImageUrl (from toEntity.value) contains the IPFS URL directly
  // For unpublished data, directImageUrl contains the entity ID (UUID), not a URL
  // We need to check if it's a valid image URL before using it
  const isValidImageUrl = directImageUrl && (directImageUrl.startsWith('ipfs://') || directImageUrl.startsWith('http'));
  const lookedUpImageSrc = useImageUrlFromEntity(linkedEntityId, spaceId);
  const imageSrc = isValidImageUrl ? directImageUrl : lookedUpImageSrc;

  return <ImageZoom imageSrc={imageSrc || ''} />;
}

function VideoRelation({ linkedEntityId, spaceId }: { linkedEntityId: string; relationId: string; spaceId: string }) {
  // Hydrate the video entity from remote to populate the reactive store
  useHydrateEntity({ id: linkedEntityId });

  // Use the efficient hook to get only the video URL for this specific entity
  const actualVideoSrc = useVideoUrlFromEntity(linkedEntityId, spaceId);

  if (!actualVideoSrc) {
    return null;
  }

  return <VideoThumbnailWithPlay videoSrc={actualVideoSrc} />;
}

function RenderedValue({
  entityId,
  propertyId,
  renderableType,
  spaceId,
  format,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  renderableType: DataType | RenderableType;
  format?: string | null;
}) {
  // Seems like we really want useRenderables to query entity data + property data
  // more granularly?
  //
  // Why is this super slow
  const valueData = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  // Should only be one value for a given (space, entity, property) tuple
  const value = valueData?.value ?? '';
  const options = valueData?.options;

  if (propertyId === SystemIds.NAME_PROPERTY) {
    return null;
  }

  // Don't render empty values in browse mode
  if (!value) {
    return null;
  }

  const hasUrlTemplate = isUrlTemplate(format);

  switch (renderableType) {
    case 'URL':
      return (
        <WebUrlField
          key={`uri-${propertyId}-${value}`}
          isEditing={false}
          spaceId={spaceId}
          value={value}
          format={format}
        />
      );
    case 'TEXT':
      return hasUrlTemplate ? (
        <WebUrlField
          key={`uri-${propertyId}-${value}`}
          isEditing={false}
          spaceId={spaceId}
          value={value}
          format={format}
        />
      ) : (
        <Text key={`string-${propertyId}-${value}`} as="p" className="max-w-full min-w-0 break-words">
          {value}
        </Text>
      );
    case 'GEO_LOCATION': {
      // Parse the coordinates using the GeoPoint utility
      const coordinates = GeoPoint.parseCoordinates(value);
      return (
        <div key={`string-${propertyId}-${value}`} className="flex w-full flex-col gap-2">
          <Text as="p">({value})</Text>
          <GeoMap latitude={coordinates?.latitude} longitude={coordinates?.longitude} />
        </div>
      );
    }
    case 'POINT': {
      return (
        <div className="flex w-full flex-col gap-2">
          <Text key={`string-${propertyId}-${value}`} as="p">
            ({value})
          </Text>
        </div>
      );
    }
    case 'INTEGER':
    case 'FLOAT':
    case 'DECIMAL':
      return (
        <ReadableNumberField
          key={`number-${propertyId}-${value}`}
          value={value}
          propertyId={propertyId}
          unitId={options?.unit ?? undefined}
        />
      );
    case 'BOOLEAN': {
      const checked = getChecked(value);

      return <Checkbox key={`checkbox-${propertyId}-${value}`} checked={checked} />;
    }
    case 'DATE':
    case 'DATETIME':
    case 'TIME': {
      return (
        <DateField
          key={`time-${propertyId}-${value}`}
          isEditing={false}
          value={value}
          propertyId={propertyId}
          dataType={renderableType}
        />
      );
    }
    case 'SCHEDULE': {
      return <ScheduleField key={`schedule-${propertyId}-${value}`} isEditing={false} value={value} />;
    }
  }
}
