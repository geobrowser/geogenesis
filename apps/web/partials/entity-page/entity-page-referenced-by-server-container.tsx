import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';

import { EntityPageReferencedBy } from './entity-page-referenced-by';
import { ReferencedByEntity } from './types';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  entityId: string;
  name: string | null;
  spaceId: string;
}

export async function EntityReferencedByServerContainer({ entityId, name }: Props) {
  const related = await Subgraph.fetchEntities({
    query: '',
    filter: [{ field: 'linked-to', value: entityId }],
  });

  const spacesForEntities = new Set(
    related
      .map(r => {
        return Entity.nameTriple(r.triples)?.space ?? null;
      })
      .flatMap(s => (s ? [s] : []))
  );

  // @TODO: single graphql call
  const maybeSpaces = await Promise.all([...spacesForEntities.values()].map(s => cachedFetchSpace(s)));
  const spaces = maybeSpaces.flatMap(s => (s ? [s] : []));

  const referencedByEntities: ReferencedByEntity[] = related.map(e => {
    const spaceId = Entity.nameTriple(e.triples)?.space ?? '';
    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space?.spaceConfig?.name ?? null;
    const spaceImage = space?.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE;

    return {
      id: e.id,
      name: e.name,
      types: e.types,
      space: {
        id: spaceId,
        name: spaceName,
        image: spaceImage,
      },
    };
  });

  return <EntityPageReferencedBy referencedByEntities={referencedByEntities} name={name} />;
}
