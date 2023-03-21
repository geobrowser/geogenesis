import * as React from 'react';

import { LinkedEntityGroup } from '~/modules/components/entity/types';
import { Entity } from '~/modules/entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { cookies } from 'next/headers';
import { EntityPageClient } from './entity-page';

interface Props {
  params: { id: string; entityId: string };
  searchParams: { env?: string };
}

export default async function EntityPage({ params, searchParams }: Props) {
  const { id, linkedEntities, name, spaceId, schemaTriples, triples } = await getEntityPageData(
    params.id,
    params.entityId,
    searchParams.env
  );

  return (
    <EntityPageClient
      id={id}
      spaceId={spaceId}
      name={name}
      linkedEntities={linkedEntities}
      schemaTriples={schemaTriples}
      triples={triples}
    />
  );
}

const getEntityPageData = async (spaceId: string, entityId: string, env?: string) => {
  const appCookies = cookies();
  const config = Params.getConfigFromUrl(
    // @TODO: Pass searchParams instead of full url
    // @TODO: Abstract this into a function
    `https://whatever.com?env=${env}`,
    appCookies.get(Params.ENV_PARAM_NAME)?.value
  );
  const storage = new StorageClient(config.ipfs);

  const network = new Network(storage, config.subgraph);

  const [entity, related] = await Promise.all([
    network.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'entity-id', value: entityId }],
    }),

    network.fetchTriples({
      space: spaceId,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'linked-to', value: entityId }],
    }),
  ]);

  const relatedEntities = await Promise.all(
    related.triples.map(triple =>
      network.fetchTriples({
        space: spaceId,
        query: '',
        skip: 0,
        first: DEFAULT_PAGE_SIZE,
        filter: [{ field: 'entity-id', value: triple.entityId }],
      })
    )
  );

  const linkedEntities: Record<string, LinkedEntityGroup> = relatedEntities
    .flatMap(entity => entity.triples)
    .reduce((acc, triple) => {
      if (!acc[triple.entityId]) acc[triple.entityId] = { triples: [], name: null, id: triple.entityId };
      acc[triple.entityId].id = triple.entityId;
      acc[triple.entityId].name = triple.entityName;
      acc[triple.entityId].triples = [...acc[triple.entityId].triples, triple]; // Duplicates?
      return acc;
    }, {} as Record<string, LinkedEntityGroup>);

  return {
    triples: entity.triples,
    schemaTriples: [] /* Todo: Fetch schema triples for entity if entity has a type */,
    id: entityId,
    name: Entity.name(entity.triples) ?? entityId,
    linkedEntities,
    spaceId: spaceId,
    key: entityId,
  };
};
