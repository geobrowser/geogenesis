import type { GetServerSideProps } from 'next';
import { useEffect } from 'react';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Editor } from '~/modules/components/entity/editor/editor';
import { LinkedEntityGroup } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider, EntityTableStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { usePageName } from '~/modules/stores/use-page-name';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Triple } from '~/modules/types';
import { Value } from '~/modules/value';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '../../[id]';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  id: string;
  name: string;
  space: string;
  blockTriples: Triple[];
  blockIdsTriple: Triple;
  linkedEntities: Record<string, LinkedEntityGroup>;
  initialTypes: Triple[];
}

export default function EntityPage(props: Props) {
  const { setPageName } = usePageName();
  const { isEditor } = useAccessControl(props.space);
  const { editable } = useEditable();

  useLogRocket(props.space);

  // This is a janky way to set the name in the navbar until we have nested layouts
  // and the navbar can query the name itself in a nice way.
  useEffect(() => {
    if (props.name !== props.id) setPageName(props.name);
    return () => setPageName('');
  }, [props.name, props.id, setPageName]);

  const renderEditablePage = isEditor && editable;

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.space}
      name={props.name}
      initialTriples={props.triples}
      initialSchemaTriples={props.schemaTriples}
      initialBlockIdsTriple={props.blockIdsTriple}
      initialBlockTriples={props.blockTriples}
    >
      <EntityTableStoreProvider spaceId={props.space} initialTypes={props.initialTypes}>
        {renderEditablePage ? (
          <div>
            <h2 className="text-2xl font-bold">{props.name} Editable TipTap Editor</h2>
            <div>Entity ID: {props.id}</div>
            <Editor />
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold">{props.name} Read-Only TipTap Editor</h2>
            <div>Entity ID: {props.id}</div>
            <Editor editable={false} />
          </div>
        )}
      </EntityTableStoreProvider>
    </EntityStoreProvider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);

  const network = new Network(storage, config.subgraph);

  const [initialSpaceTypes, initialForeignTypes] = await Promise.all([
    fetchSpaceTypeTriples(network, space),
    fetchForeignTypeTriples(network, space),
  ]);

  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];

  /* Storing the array of block ids as a string value since we currently do not support arrays */
  const blockIdTriples = await network.fetchTriples({
    space,
    query: '',
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'entity-id', value: entityId },
      {
        field: 'attribute-id',
        value: SYSTEM_IDS.BLOCKS,
      },
    ],
  });

  const blockIdsTriple = blockIdTriples.triples[0] || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return network.fetchTriples({
          space,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(block => block.triples);

  const [entity, related] = await Promise.all([
    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'entity-id', value: entityId }],
    }),

    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [{ field: 'linked-to', value: entityId }],
    }),
  ]);

  const relatedEntities = await Promise.all(
    related.triples.map(triple =>
      network.fetchTriples({
        space,
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
    props: {
      triples: entity.triples,
      schemaTriples: [] /* Todo: Fetch schema triples for entity if entity has a type */,
      id: entityId,
      name: Entity.name(entity.triples) ?? entityId,
      space,
      initialTypes,
      linkedEntities,
      key: entityId,
      blockIdsTriple,
      blockTriples,
    },
  };
};
