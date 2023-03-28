import type { GetServerSideProps } from 'next';
import { useEffect } from 'react';
import Head from 'next/head';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { usePageName } from '~/modules/stores/use-page-name';
import { Triple, Version } from '~/modules/types';
import { NavUtils } from '~/modules/utils';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Value } from '~/modules/value';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '../[id]';
import { EntityPageTableBlockStoreProvider } from '~/modules/components/entity/entity-page-table-block-store-provider';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';

interface Props {
  triples: Triple[];
  schemaTriples: Triple[];
  versions: Version[];
  id: string;
  name: string;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];

  // For the page editor
  blockTriples: Triple[];
  blockIdsTriple: Triple | null;
}

export default function EntityPage(props: Props) {
  const { setPageName } = usePageName();
  const { isEditor } = useAccessControl(props.spaceId);
  const { editable } = useEditable();

  // This is a janky way to set the name in the navbar until we have nested layouts
  // and the navbar can query the name itself in a nice way.
  useEffect(() => {
    if (props.name !== props.id) setPageName(props.name);
    return () => setPageName('');
  }, [props.name, props.id, setPageName]);

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <>
      <Head>
        <title>{props.name ?? props.id}</title>
        <meta property="og:url" content={`https://geobrowser.io${NavUtils.toEntity(props.spaceId, props.id)}`} />
      </Head>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.spaceId}
        initialTriples={props.triples}
        initialSchemaTriples={props.schemaTriples}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
      >
        <EntityPageTableBlockStoreProvider
          spaceId={props.spaceId}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
        >
          <EntityPageContentContainer>
            <Page {...props} />
          </EntityPageContentContainer>
        </EntityPageTableBlockStoreProvider>
      </EntityStoreProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);

  const [entity, related, versions] = await Promise.all([
    network.fetchEntity(entityId),

    network.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    network.fetchProposedVersions(entityId, spaceId),
  ]);

  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);

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

  /* Storing the array of block ids as a string value since we currently do not support arrays */
  const blockIdTriples = await network.fetchTriples({
    space: spaceId,
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

  // @TODO: Try and use fetchEntity instead
  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return network.fetchTriples({
          space: spaceId,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(block => block.triples);

  const [initialSpaceTypes, initialForeignTypes] = await Promise.all([
    // TODO: Import these from somewhere else or do this on the client
    fetchSpaceTypeTriples(network, spaceId),
    space ? fetchForeignTypeTriples(network, space) : Promise.resolve([]),
  ]);

  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];

  return {
    props: {
      triples: entity?.triples ?? [],
      schemaTriples: [] /* @TODO: Fetch schema triples for entity if entity has a type */,
      id: entityId,
      name: entity?.name ?? entityId,
      spaceId,
      referencedByEntities,
      versions,
      key: entityId,

      // For entity page editor
      blockIdsTriple,
      blockTriples,
      initialTypes,
    },
  };
};
