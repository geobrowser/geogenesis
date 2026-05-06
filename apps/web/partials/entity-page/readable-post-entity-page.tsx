'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY, SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { useRenderedPropertiesWithContent } from '~/core/hooks/use-renderables';
import { useQueryEntity, useQueryProperty, useValue, useValues } from '~/core/sync/use-store';
import { DataType, RenderableType } from '~/core/types';
import { isUrlTemplate } from '~/core/utils/url-template';
import { GeoNumber, GeoPoint } from '~/core/utils/utils';

import { Accordion } from '~/design-system/accordion';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ScheduleField } from '~/design-system/editable-fields/schedule-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Map } from '~/design-system/map';
import { Text } from '~/design-system/text';

import { PropertyNameLink } from '~/partials/entity-page/property-name-link';
import { RelationsGroup } from '~/partials/entity-page/readable-entity-page';

type Props = {
  id: string;
  spaceId: string;
};

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

function countRenderableProperty(renderedProperties: string[]): number {
  let count = 0;
  renderedProperties.forEach(propertyId => {
    if (!SKIPPED_PROPERTIES.includes(propertyId)) {
      count++;
    }
  });
  return count;
}

function useReadablePostEntityPageHasContent(entityId: string, spaceId: string): boolean {
  const renderedProperties = useRenderedPropertiesWithContent(entityId, spaceId);
  return countRenderableProperty(Object.keys(renderedProperties)) > 0;
}

function ReadablePostMetadataPanel({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const renderedProperties = useRenderedPropertiesWithContent(entityId, spaceId);

  if (countRenderableProperty(Object.keys(renderedProperties)) <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-5 pt-0">
      {Object.entries(renderedProperties)
        .filter(([propertyId]) => !SKIPPED_PROPERTIES.includes(propertyId))
        .map(([propertyId, property]) => {
          const isRelation = property.dataType === 'RELATION';

          if (isRelation) {
            return <RelationsGroup key={propertyId} entityId={entityId} spaceId={spaceId} propertyId={propertyId} />;
          }

          return <ValuesGroup key={propertyId} entityId={entityId} propertyId={propertyId} spaceId={spaceId} />;
        })}
    </div>
  );
}

export function ReadablePostEntityPage({ id, spaceId }: Props) {
  const hasContent = useReadablePostEntityPageHasContent(id, spaceId);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="rounded-lg border border-grey-02 shadow-button">
      <Accordion type="single" defaultValue="post-information" collapsible className="w-full">
        <Accordion.Item value="post-information" className="border-none">
          <Accordion.Trigger className="px-5 py-4">
            <Text as="span" variant="body">
              Post information
            </Text>
          </Accordion.Trigger>
          <Accordion.Content className="border-t border-grey-02 px-0 pt-0 [&>div]:pb-0">
            <ReadablePostMetadataPanel entityId={id} spaceId={spaceId} />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

const ReadableNumberField = ({ value, unitId, propertyId }: { value: string; unitId?: string; propertyId: string }) => {
  const { property } = useQueryProperty({ id: propertyId });

  const format = property?.format || undefined;
  const propertyUnitId = property?.unit || undefined;

  const actualUnitId = unitId || propertyUnitId || undefined;
  const { entity: unitEntity } = useQueryEntity({ id: actualUnitId });

  const currencySign = React.useMemo(
    () => unitEntity?.values.find(t => t.property.id === SystemIds.CURRENCY_SIGN_PROPERTY)?.value || '',
    [unitEntity]
  );

  return <Text as="p">{GeoNumber.format(value, format, currencySign)}</Text>;
};

function ValuesGroup({ entityId, spaceId, propertyId }: { entityId: string; spaceId: string; propertyId: string }) {
  const { property } = useQueryProperty({ id: propertyId });

  const values = useValues({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  if (!property) {
    return null;
  }

  const nonEmptyValues = values.filter(v => v.value);

  if (nonEmptyValues.length === 0) {
    return null;
  }

  return (
    <>
      {nonEmptyValues.map((t, index) => {
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
  const valueData = useValue({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  const value = valueData?.value ?? '';
  const options = valueData?.options;

  if (propertyId === SystemIds.NAME_PROPERTY) {
    return null;
  }

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
    case 'SCHEDULE': {
      return <ScheduleField key={`schedule-${propertyId}-${value}`} isEditing={false} value={value} />;
    }
  }
}
