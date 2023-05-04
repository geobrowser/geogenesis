import * as React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
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
import { EntityPageCover } from '~/modules/components/entity/entity-page-cover';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { EditableHeading } from '~/modules/components/entity/editable-entity-header';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/modules/spaces/fetch-types';
import { getOpenGraphImageUrl } from '~/modules/utils';

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
  redirect: string | null;
}

export default function EntityPage(props: Props) {
  const router = useRouter();

  if (props.redirect) {
    router.push(props.redirect);
  }

  const { isEditor } = useAccessControl(props.spaceId);
  const { editable } = useEditable();

  const renderEditablePage = isEditor && editable;
  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;
  const imageUrl = props.serverAvatarUrl || props.serverCoverUrl || '';
  const openGraphImageUrl = getOpenGraphImageUrl(imageUrl);
  const description =
    props.description || `Browse and organize the world's public knowledge and information in a decentralized way.`;

  if (props.redirect) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{props.name ?? props.id}</title>
        <meta property="og:title" content={props.name} />
        <meta property="og:url" content={`https://geobrowser.io${NavUtils.toEntity(props.spaceId, props.id)}`} />
        <meta property="og:image" content={openGraphImageUrl} />
        <meta name="twitter:image" content={openGraphImageUrl} />
        <meta property="description" content={description} />
        <meta property="og:description" content={description} />
        <meta name="twitter:description" content={description} />
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
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />

          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            <Page {...props} />
          </EntityPageContentContainer>
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

  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId) ?? null;

  const [entity, related, spaceTypes, foreignSpaceTypes] = await Promise.all([
    network.fetchEntity(entityId),

    network.fetchEntities({
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    fetchSpaceTypeTriples(network, spaceId),
    space ? fetchForeignTypeTriples(network, space) : [],
  ]);

  // Redirect from space configuration page to space page
  let redirect: string | null = null;
  if (entity?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && entity?.nameTripleSpace) {
    redirect = `/space/${entity?.nameTripleSpace}`;
  }

  const serverAvatarUrl = Entity.avatar(entity?.triples);
  const serverCoverUrl = Entity.cover(entity?.triples);

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

  const blockIdsTriple = entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  // @TODO: Try and use fetchEntity instead. blockTriples are the triples of each block that contain
  // the content for the block. e.g., the Markdown triple or the RowType triple, etc. Ideally we fetch
  // the entire entity for each block so the query isn't dependenent on the space and we have the types
  // associated with each block entity (TableBlock, TextBlock, etc.)
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

      // For entity page editor
      blockIdsTriple,
      blockTriples,

      space,
      spaceTypes: [...spaceTypes, ...foreignSpaceTypes],
      redirect,
    },
  };
};
