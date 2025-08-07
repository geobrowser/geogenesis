import { ContentIds, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { FORMAT_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { useRenderedProperties } from '~/core/hooks/use-renderables';
import { useQueryEntity, useQueryProperty, useRelations, useValue, useValues } from '~/core/sync/use-store';
import { GeoNumber, GeoPoint, NavUtils, getImagePath, useImageUrlFromEntity } from '~/core/utils/utils';
import { DataType, RenderableType } from '~/core/v2.types';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
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
  const renderedProperties = useRenderedProperties(entityId, spaceId);

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
  const { entity } = useQueryEntity({ id: unitId });
  const { property } = useQueryProperty({ id: propertyId });

  // Use format and unit from the property directly
  const format = property?.format;
  const propertyUnitId = property?.unit;

  // Use unitId from value options if available, otherwise fall back to property unit
  const actualUnitId = unitId || propertyUnitId;
  const { entity: unitEntity } = useQueryEntity({ id: actualUnitId });

  const currencySign = React.useMemo(
    () => unitEntity?.values.find(t => t.property.id === SystemIds.CURRENCY_SIGN_PROPERTY)?.value,
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

  return (
    <>
      {values.map((t, index) => {
        // hide name property, it is already rendered in the header
        // @TODO: filter ahead of time rather than returning null here
        if (propertyId === SystemIds.NAME_PROPERTY) {
          return null;
        }
        return (
          <div key={`${entityId}-${propertyId}-${index}`} className="break-words">
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

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId && r.type.id === propertyId,
  });


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

  return (
    <>
      <div key={`${propertyId}-${property.name}`} className="break-words">
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
            const linkedSpaceId = r.spaceId;
            const relationName = r.toEntity.name;
            const relationEntityId = r.entityId;
            const relationId = r.id;

            if (property.renderableTypeStrict === 'IMAGE') {
              return <ImageRelation key={`image-${relationId}-${linkedEntityId}`} linkedEntityId={linkedEntityId} relationId={relationId} spaceId={spaceId} />;
            }

            return (
              <div key={`relation-${relationId}-${linkedEntityId}`} className="mt-1">
                <LinkableRelationChip
                  isEditing={false}
                  currentSpaceId={spaceId}
                  entityId={linkedEntityId}
                  spaceId={linkedSpaceId}
                  relationEntityId={relationEntityId}
                  relationId={relationId}
                >
                  {relationName ?? linkedEntityId}
                </LinkableRelationChip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ImageRelation({ linkedEntityId, spaceId }: { linkedEntityId: string; relationId: string; spaceId: string }) {
  // Use the efficient hook to get only the image URL for this specific entity
  const actualImageSrc = useImageUrlFromEntity(linkedEntityId, spaceId);
  
  return <ImageZoom imageSrc={getImagePath(actualImageSrc || '')} />;
}

function RenderedValue({
  entityId,
  propertyId,
  renderableType,
  spaceId,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
  renderableType: DataType | RenderableType;
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

  switch (renderableType) {
    case 'URL':
      return <WebUrlField key={`uri-${propertyId}-${value}`} isEditing={false} spaceId={spaceId} value={value} />;
    case 'TEXT':
      return (
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
    case 'NUMBER':
      return (
        <ReadableNumberField
          key={`number-${propertyId}-${value}`}
          value={value}
          propertyId={propertyId}
          unitId={options?.unit ?? undefined}
        />
      );
    case 'CHECKBOX': {
      const checked = getChecked(value);

      return <Checkbox key={`checkbox-${propertyId}-${value}`} checked={checked} />;
    }
    case 'TIME': {
      return <DateField key={`time-${propertyId}-${value}`} isEditing={false} value={value} propertyId={propertyId} />;
    }
  }
}
