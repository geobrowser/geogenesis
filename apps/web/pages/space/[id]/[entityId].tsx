import { GetServerSideProps } from 'next';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { EntityNames, Triple } from '~/modules/types';
import { getEntityName } from '~/modules/utils';
import { LinkedEntityGroup } from '~/modules/components/entity/types';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  space: string;
  entityNames: EntityNames;
  linkedEntities: Record<string, LinkedEntityGroup>;
}

export default function EntityPage(props: Props) {
  return <ReadableEntityPage {...props} />;
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = getConfigFromUrl(context.resolvedUrl);

  const storage = new StorageClient(config.ipfs);

  const [entity, related] = await Promise.all([
    new Network(storage, config.subgraph).fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [{ field: 'entity-id', value: entityId }],
    }),

    new Network(storage, config.subgraph).fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [{ field: 'linked-to', value: entityId }],
    }),
  ]);

  const relatedEntities = await Promise.all(
    related.triples.map(triple =>
      new Network(storage, config.subgraph).fetchTriples({
        space,
        query: '',
        skip: 0,
        first: 100,
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

  const relatedEntityAttributeNames = relatedEntities.reduce((acc, { entityNames }) => {
    return { ...acc, ...entityNames };
  }, {} as EntityNames);

  return {
    props: {
      triples: entity.triples,
      id: entityId,
      name: getEntityName(entity.triples) ?? entityId,
      space,
      entityNames: {
        ...entity.entityNames,
        ...related.entityNames,
        ...relatedEntityAttributeNames,
      },
      linkedEntities,
      key: entityId,
    },
  };
};
