import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Metadata } from 'next';

import { Network, Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { Params } from '~/core/params';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { ReferencedByEntity } from '~/partials/entity-page/types';

import { Component } from './component';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const network = new Network.NetworkClient(config.subgraph);

  const space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    return redirect(`/space/${spaceId}/entities`);
  }

  const entity = await network.fetchEntity(entityId);
  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);

  return {
    title: entityName ?? spaceId,
    description,
    openGraph: {
      title: entityName ?? spaceId,
      description,
      url: `https://geobrowser.io${NavUtils.toEntity(spaceId, entityId)}`,
      images: [
        {
          url: openGraphImageUrl,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      description,
      images: [
        {
          url: openGraphImageUrl,
        },
      ],
    },
  };
}

export default async function SpacePage({ params, searchParams }: Props) {
  const props = await getData(params.id, searchParams);

  return <Component {...props} />;
}

const getData = async (spaceId: string, searchParams: ServerSideEnvParams) => {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const network = new Network.NetworkClient(config.subgraph);

  const spaces = await Subgraph.fetchSpaces({ endpoint: config.subgraph });
  const space = spaces.find(s => s.id === spaceId) ?? null;
  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const [entity, related, spaceTypes, foreignSpaceTypes] = await Promise.all([
    network.fetchEntity(entityId),

    Subgraph.fetchEntities({
      endpoint: config.subgraph,
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId, config.subgraph),
    space ? fetchForeignTypeTriples(Subgraph.fetchTriples, space, config.subgraph) : [],
  ]);

  // @HACK: Entities we are rendering might be in a different space. Right now there's a bug where we aren't
  // fetching the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log('Redirecting to space from space configuration entity', entity?.nameTripleSpace);
      redirect(`/space/${entity?.nameTripleSpace}/${entityId}`);
    }
  }

  const spaceName = space?.attributes[SYSTEM_IDS.NAME] ?? null;
  const serverAvatarUrl = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const serverCoverUrl = Entity.cover(entity?.triples);

  const referencedByEntities: ReferencedByEntity[] = related.map(e => {
    const spaceId = Entity.nameTriple(e.triples)?.space ?? '';
    const space = spaces.find(s => s.id === spaceId);

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

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(triples => triples);

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? spaceName ?? '',
    description: Entity.description(entity?.triples ?? []),
    spaceId,
    referencedByEntities,
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples,

    space,
    spaceTypes: [...spaceTypes, ...foreignSpaceTypes],
  };
};
