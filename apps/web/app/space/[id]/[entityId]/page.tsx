import { SYSTEM_IDS } from '@geogenesis/ids';
import type { Metadata } from 'next';

import { ReferencedByEntity } from '~/modules/components/entity/types';
import { Entity } from '~/modules/entity';
import { Params } from '~/modules/params';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { ServerSideEnvParams } from '~/modules/types';
import { getOpenGraphMetadataForEntity, NavUtils } from '~/modules/utils';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { Value } from '~/modules/value';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/modules/spaces/fetch-types';
import { Component } from './component';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const entityId = params.entityId;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

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

export default async function EntityPage({ params, searchParams }: Props) {
  const props = await getData(params.id, params.entityId, searchParams);

  return <Component {...props} />;
}

const getData = async (spaceId: string, entityId: string, searchParams: ServerSideEnvParams) => {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

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
  if (entity?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && entity?.nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${entity.id} to space page ${entity?.nameTripleSpace}`);
    return redirect(`/space/${entity?.nameTripleSpace}`);
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log(
        `Redirecting from incorrect space ${spaceId} to correct space ${entity?.nameTripleSpace} for entity ${entityId}`
      );
      return redirect(`/space/${entity?.nameTripleSpace}/${entityId}`);
    }
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

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return network.fetchTriples({
          // Previously we would scope the triples we're fetching to the space we're in. Right now
          // this model doesn't make sense since triples can only exist in one space at a time.
          // Eventually entities can have triples spanning many spaces so adding back the space
          // will make sense at that point. Additionally there's a bug where we do not navigate
          // to the correct space when navigating to an entity in a different space. It _happens_
          // to work correctly because we do not scope the triples to the space.
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(block => block.triples);

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? entityId,
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
