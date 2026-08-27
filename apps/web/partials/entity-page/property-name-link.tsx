'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useValues } from '~/core/sync/use-store';
import { getSpaceRank } from '~/core/utils/space/space-ranking';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

type PropertyNameLinkProps = {
  property: { id: string; name: string | null };
  spaceId: string;
  showDescriptionTooltip?: boolean;
};

function PropertyNameLinkBase({ property, spaceId }: Pick<PropertyNameLinkProps, 'property' | 'spaceId'>) {
  const propertyName = property.name?.trim() || property.id;

  return (
    <Link
      href={NavUtils.toEntity(spaceId, property.id)}
      entityId={property.id}
      spaceId={spaceId}
      className="group inline-flex max-w-full"
    >
      <Text
        as="span"
        variant="bodySemibold"
        className="min-w-0 leading-tight break-words underline-offset-2 group-hover:underline group-focus-visible:underline"
      >
        {propertyName}
      </Text>
    </Link>
  );
}

function PropertyNameLinkWithTooltip({ property, spaceId }: Pick<PropertyNameLinkProps, 'property' | 'spaceId'>) {
  const descriptionValues = useValues({
    selector: v =>
      v.property.id === SystemIds.DESCRIPTION_PROPERTY &&
      v.entity.id === property.id &&
      typeof v.value === 'string' &&
      v.value.trim().length > 0,
  });

  // Prefer the current (to-)space's description if present, otherwise pick
  // the value from the highest-ranked space the property is published in.
  const description =
    descriptionValues.find(v => v.spaceId === spaceId)?.value.trim() ??
    descriptionValues
      .reduce<(typeof descriptionValues)[number] | null>(
        (best, v) => (best === null || getSpaceRank(v.spaceId) < getSpaceRank(best.spaceId) ? v : best),
        null
      )
      ?.value.trim() ??
    '';
  const link = <PropertyNameLinkBase property={property} spaceId={spaceId} />;

  if (!description) {
    return link;
  }

  return <Tooltip trigger={link} label={description} position="top" align="start" variant="propertyDescription" />;
}

export function PropertyNameLink({ property, spaceId, showDescriptionTooltip = true }: PropertyNameLinkProps) {
  if (!showDescriptionTooltip) {
    return <PropertyNameLinkBase property={property} spaceId={spaceId} />;
  }

  return <PropertyNameLinkWithTooltip property={property} spaceId={spaceId} />;
}
