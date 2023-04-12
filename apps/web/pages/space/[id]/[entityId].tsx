import * as React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ReadableEntityPage } from '~/modules/components/entity/readable-entity-page';
import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity, EntityStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { useEditable } from '~/modules/stores/use-editable';
import { Space, Triple } from '~/modules/types';
import { NavUtils } from '~/modules/utils';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Value } from '~/modules/value';
import { TypesStoreProvider } from '~/modules/type/types-store';

interface Props {
  triples: Triple[];
  id: string;
  name: string;
  description: string | null;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;

  // For the page editor
  blockTriples: Triple[];
  blockIdsTriple: Triple | null;

  spaceTypes: Triple[];
  space: Space | null;
}

export default function EntityPage(props: Props) {
  const { isEditor } = useAccessControl(props.spaceId);
  const { editable } = useEditable();

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <>
      <Head>
        <title>{props.name ?? props.id}</title>
        <meta property="og:title" content={props.name} />
        <meta property="og:url" content={`https://geobrowser.io${NavUtils.toEntity(props.spaceId, props.id)}`} />
        {props.serverCoverUrl && <meta property="og:image" content={props.serverCoverUrl} />}
        {props.serverCoverUrl && (
          <meta name="twitter:image" content="https://www.geobrowser.io/static/geo-social-image.png" />
        )}
        {props.description && <meta property="description" content={props.description} />}
        {props.description && <meta property="og:description" content={props.description} />}
        {props.description && <meta name="twitter:description" content={props.description} />}
      </Head>
      <TypesStoreProvider initialTypes={props.spaceTypes} space={props.space}>
        <EntityStoreProvider
          id={props.id}
          spaceId={props.spaceId}
          initialTriples={props.triples}
          initialSchemaTriples={[]}
          initialBlockIdsTriple={props.blockIdsTriple}
          initialBlockTriples={props.blockTriples}
        >
          <Page {...props} schemaTriples={[]} />
        </EntityStoreProvider>
      </TypesStoreProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.query.id as string;
  const entityId = context.query.entityId as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

  const [entity, related, spaceTypes] = await Promise.all([
    network.fetchEntity(entityId),

    network.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    fetchSpaceTypeTriples(network, spaceId),
  ]);
  const serverAvatarUrl = Entity.avatar(entity?.triples);
  const serverCoverUrl = Entity.cover(entity?.triples);

  const spaces = await network.fetchSpaces();

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
  // @TODO: the Block triple for the entity should already be fetched in the entity query above
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

  return {
    props: {
      triples: entity?.triples ?? [],
      id: entityId,
      name: entity?.name ?? entityId,
      description: Entity.description(entity?.triples ?? []),
      spaceId,
      referencedByEntities,
      key: entityId,
      serverAvatarUrl,
      serverCoverUrl,

      space: spaces.find(s => s.id === spaceId) ?? null,

      // For entity page editor
      blockIdsTriple,
      blockTriples,

      spaceTypes,
    },
  };
};

export const fetchSpaceTypeTriples = async (network: NetworkData.INetwork, spaceId: string) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */

  const { triples } = await network.fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
};
