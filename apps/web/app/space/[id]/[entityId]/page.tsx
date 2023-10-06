import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Suspense } from 'react';

import type { Metadata } from 'next';

import { AppConfig } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';

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
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const props = await getData(params.id, params.entityId, config);
  const filterId = searchParams.filterId ?? null;
  const filterValue = searchParams.filterValue ?? null;
  const typeId = searchParams.typeId ?? null;

  return (
    // @ts-expect-error async JSX function
    <TypesStoreServerContainer spaceId={params.id} endpoint={config.subgraph}>
      <Component
        {...props}
        filterId={filterId}
        filterValue={filterValue}
        typeId={typeId}
        ReferencedByComponent={
          <Suspense fallback={<EntityReferencedByLoading />}>
            {/* @ts-expect-error async JSX function */}
            <EntityReferencedByServerContainer entityId={props.id} name={props.name} searchParams={searchParams} />
          </Suspense>
        }
      />
    </TypesStoreServerContainer>
  );
}

const getData = async (spaceId: string, entityId: string, config: AppConfig) => {
  const space = await Subgraph.fetchSpace({ id: spaceId, endpoint: config.subgraph });
  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });

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

  const blockIdsTriple = entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const collectionId = blockIdsTriple?.value.type === 'collection' ? blockIdsTriple?.value.id : null;

  // Fetches all of the entities with a COLLECTION REFERENCE that points to the collection id
  const collectionCollectionReferences = collectionId
    ? await Subgraph.fetchTriples({
        endpoint: config.subgraph,
        query: '',
        first: 1000,
        skip: 0,
        filter: [
          {
            field: 'attribute-id',
            value: SYSTEM_IDS.COLLECTION_REFERENCE,
          },
          {
            field: 'linked-to',
            value: collectionId,
          },
        ],
      })
    : [];

  // Now we need to fetch all of the blocks for each of the collection items
  const collectionBlockReferences = (
    await Promise.all(
      collectionCollectionReferences.map(item => {
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          first: 1000,
          skip: 0,
          filter: [
            {
              field: 'attribute-id',
              value: SYSTEM_IDS.ENTITY_REFERENCE,
            },
            {
              field: 'entity-id',
              value: item.entityId,
            },
          ],
        });
      })
    )
  ).flatMap(triples => triples);

  const blockTriples = (
    await Promise.all(
      collectionBlockReferences.map(ref => {
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: ref.value.id }],
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
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples,
    collectionTriples: [...collectionBlockReferences, ...collectionCollectionReferences],

    space,
  };
};
