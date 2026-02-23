'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { ADDRESS_PROPERTY, RENDERABLE_TYPE_PROPERTY, VENUE_PROPERTY } from '~/core/constants';
import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
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
import { GeoNumber, GeoPoint, NavUtils, sortRelations } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom, VideoThumbnailWithPlay } from '~/design-system/editable-fields/editable-fields';
import { GeoLocationWrapper } from '~/design-system/editable-fields/geo-location-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Map } from '~/design-system/map';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

interface Props {
  id: string;
  spaceId: string;
}

const SKIPPED_PROPERTIES: string[] = [
  SystemIds.TYPES_PROPERTY,
  SystemIds.NAME_PROPERTY,
  SystemIds.COVER_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
];

function countRenderableProperty(renderedProperties: string[]): number {
  let count = 0;
  renderedProperties.forEach(propertyId => {
    if (!SKIPPED_PROPERTIES.includes(propertyId)) {
      count++;
    }
  });
  return count;
}

export function ReadableEntityPage({ id: entityId, spaceId }: Props) {
  const renderedProperties = useRenderedPropertiesWithContent(entityId, spaceId);

  if (countRenderableProperty(Object.keys(renderedProperties)) <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-grey-02 p-5 shadow-button">
      {Object.entries(renderedProperties).map(([propertyId, property]) => {
        const isRelation = property.dataType === 'RELATION';

        if (isRelation) {
          return <RelationsGroup key={propertyId} entityId={entityId} spaceId={spaceId} propertyId={propertyId} />;
        }

        return <ValuesGroup key={propertyId} entityId={entityId} propertyId={propertyId} spaceId={spaceId} />;
      })}
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
          <div key={`${entityId}-${propertyId}-${index}`} className="wrap-break-word">
            <Link href={NavUtils.toEntity(spaceId, propertyId)}>
              <Text as="p" variant="bodySemibold">
                {property.name || propertyId}
              </Text>
            </Link>
            <div className="flex flex-wrap gap-2">
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
    propertyId === RENDERABLE_TYPE_PROPERTY
  ) {
    return null;
  }

  // Check if we should show a map for Address or Venue properties
  const shouldShowMap = (propertyId === ADDRESS_PROPERTY || propertyId === VENUE_PROPERTY) && relations.length > 0;
  const firstRelation = relations[0];

  return (
    <>
      <div key={`${propertyId}-${property.name}`} className="wrap-break-word">
        {propertyId !== SystemIds.TYPES_PROPERTY && (
          <Link href={NavUtils.toEntity(spaceId, propertyId)}>
            <Text as="p" variant="bodySemibold">
              {property.name ?? propertyId}
            </Text>
          </Link>
        )}

        <div className="flex flex-wrap gap-2">
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
              <div key={`relation-${relationId}-${linkedEntityId}`} className={isMetadataHeader ? '' : 'mt-1'}>
                <LinkableRelationChip
                  isEditing={false}
                  currentSpaceId={spaceId}
                  entityId={linkedEntityId}
                  spaceId={linkedSpaceId}
                  relationEntityId={relationEntityId}
                  relationId={relationId}
                  small
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
        <Text key={`string-${propertyId}-${value}`} as="p">
          {value}
        </Text>
      );
    case 'GEO_LOCATION': {
      // Parse the coordinates using the GeoPoint utility
      const coordinates = GeoPoint.parseCoordinates(value);
      return (
        <div key={`string-${propertyId}-${value}`} className="flex w-full flex-col gap-2">
          <Text as="p">({value})</Text>
          <Map latitude={coordinates?.latitude} longitude={coordinates?.longitude} />
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
  }
}
