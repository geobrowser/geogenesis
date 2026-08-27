import { GraphUrl } from '@geoprotocol/geo-sdk/lite';

import { NavUtils, validateEntityId, validateSpaceId } from '~/core/utils/utils';

export type ResolvedGraphLink = {
  entityId: string;
  spaceId: string;
  href: string;
};

export type ParsedGraphLink = {
  entityId: string;
  spaceId: string | null;
  graphHref: `graph://${string}`;
};

export function parseGraphLinkHref(href: string | null | undefined): ParsedGraphLink | null {
  const graphHref = href?.trim();
  if (!graphHref?.startsWith('graph://')) return null;

  try {
    const entityId = GraphUrl.toEntityId(graphHref as `graph://${string}`);
    if (!validateEntityId(entityId)) return null;

    const parsedSpaceId = GraphUrl.toSpaceId(graphHref as `graph://${string}`);
    if (parsedSpaceId !== null && !validateSpaceId(parsedSpaceId)) return null;

    return {
      entityId,
      spaceId: parsedSpaceId,
      graphHref: graphHref as `graph://${string}`,
    };
  } catch {
    return null;
  }
}

export function resolveGraphLinkHref(
  href: string | null | undefined,
  fallbackSpaceId: string
): ResolvedGraphLink | null {
  const parsed = parseGraphLinkHref(href);
  if (!parsed) return null;

  const spaceId = parsed.spaceId ?? fallbackSpaceId;
  if (!validateSpaceId(spaceId)) return null;

  return {
    entityId: parsed.entityId,
    spaceId,
    href: NavUtils.toEntity(spaceId, parsed.entityId),
  };
}
