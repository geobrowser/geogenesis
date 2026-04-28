'use client';

import { useDescription } from '~/core/state/entity-page-store/entity-store';
import { Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

type PropertyNameLinkProps = {
  property: Property;
  spaceId: string;
};

export function PropertyNameLink({ property, spaceId }: PropertyNameLinkProps) {
  const description = useDescription(property.id, spaceId)?.trim();
  const propertyName = property.name ?? property.id;

  const link = (
    <Link
      href={NavUtils.toEntity(spaceId, property.id)}
      entityId={property.id}
      spaceId={spaceId}
      className="group inline-flex max-w-full"
    >
      <Text
        as="span"
        variant="bodySemibold"
        className="min-w-0 break-words underline-offset-2 group-hover:underline group-focus-visible:underline"
      >
        {propertyName}
      </Text>
    </Link>
  );

  if (!description) {
    return link;
  }

  return <Tooltip trigger={link} label={description} position="top" variant="propertyDescription" />;
}
