import { ContextParams } from '@aragon/sdk-client-common';
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

export const runtime = 'edge';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
}

const minimalAragonSDKContextParams: ContextParams = {
  network: 'maticmum',
  // signer: ethersSigner,
  daoFactoryAddress: '0xc715336B5E7F10294F36CA09f19A0493070E2eFB', // mumbai dao factory address
  web3Providers: ['https://rpc.ankr.com/eth_goerli'],
  ipfsNodes: [
    {
      url: 'https://testing-ipfs-0.aragon.network/api/v0',
      headers: { 'X-API-KEY': process.env.NEXT_PUBLIC_IPFS_KEY || '' },
    },
  ],
  graphqlNodes: [
    {
      url: 'https://subgraph.satsuma-prod.com/aragon/osx-mumbai/api',
    },
  ],
};

console.log('minimalAragonSDKContextParams', minimalAragonSDKContextParams);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    return redirect(`/space/${spaceId}/entities`);
  }

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

export default async function SpacePage({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const props = await getData(params.id, config);

  return (
    // @ts-expect-error async JSX function
    <TypesStoreServerContainer spaceId={params.id} endpoint={config.subgraph}>
      <Component
        {...props}
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

const getData = async (spaceId: string, config: AppConfig) => {
  const spaces = await Subgraph.fetchSpaces({ endpoint: config.subgraph });
  const space = spaces.find(s => s.id === spaceId) ?? null;
  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });

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
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples,

    space,
  };
};
