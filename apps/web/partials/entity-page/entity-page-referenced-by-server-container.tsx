import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { EntityPageReferencedBy } from './entity-page-referenced-by';
import { ReferencedByEntity } from './types';

interface Props {
  entityId: string;
  name: string;
  searchParams: ServerSideEnvParams;
}

export async function EntityReferencedByServerContainer({ entityId, name, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const [related, spaces] = await Promise.all([
    Subgraph.fetchEntities({
      endpoint: config.subgraph,
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),
    Subgraph.fetchSpaces({ endpoint: config.subgraph }),
  ]);

  const referencedByEntities: ReferencedByEntity[] = related.map(e => {
    const spaceId = Entity.nameTriple(e.triples)?.space ?? '';
    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space?.attributes[SYSTEM_IDS.NAME] ?? null;
    const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;

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
