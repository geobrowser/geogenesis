import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Metadata } from 'next';

import { DEFAULT_TRIPLES_PAGE_SIZE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { ReferencedByEntity } from '~/partials/entity-page/types';

import { Component } from './component';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams & {
    typeId?: string;
    filterId?: string;
    filterValue?: string;
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const entityId = params.entityId;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });
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
  const filterId = searchParams.filterId ?? null;
  const filterValue = searchParams.filterValue ?? null;
  const typeId = searchParams.typeId ?? null;

  return <Component {...props} filterId={filterId} filterValue={filterValue} typeId={typeId} />;
}

const getData = async (spaceId: string, entityId: string, searchParams: ServerSideEnvParams) => {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const spaces = await Subgraph.fetchSpaces({ endpoint: config.subgraph });
  const space = spaces.find(s => s.id === spaceId) ?? null;

  const [entity, related, spaceTypes, foreignSpaceTypes] = await Promise.all([
    Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId }),

    Subgraph.fetchEntities({
      endpoint: config.subgraph,
      query: '',
      filter: [{ field: 'linked-to', value: entityId }],
    }),

    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId, config.subgraph),
    space ? fetchForeignTypeTriples(Subgraph.fetchTriples, space, config.subgraph) : [],
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
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          skip: 0,
          first: DEFAULT_TRIPLES_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(triples => triples);

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
