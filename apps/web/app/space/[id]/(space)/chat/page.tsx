import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { WALLET_ADDRESS } from '~/core/cookie';

import { getIsEditorForSpace } from '~/partials/space-page/get-is-editor-for-space';
import { getIsMemberForSpace } from '~/partials/space-page/get-is-member-for-space';
import { SpaceChatPage } from '~/partials/space-chat/space-chat-page';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    return { title: 'Not Found' };
  }

  const space = await cachedFetchSpace(spaceId);
  const spaceName = space?.entity?.name ?? `Space ${spaceId}`;

  return {
    title: `${spaceName} Chat`,
  };
}

export default async function Chat(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  if (!space) {
    notFound();
  }

  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value ?? null;
  const spaceName = space.entity?.name ?? `Space ${params.id}`;
  const connectedAddressForAccess = connectedAddress ?? undefined;
  const canPost =
    space.type === 'PERSONAL'
      ? Boolean(connectedAddress)
      : Boolean(connectedAddress) &&
        ((await getIsEditorForSpace(params.id, connectedAddressForAccess)) ||
          (await getIsMemberForSpace(params.id, connectedAddressForAccess)));

  return <SpaceChatPage spaceId={params.id} spaceName={spaceName} connectedAddress={connectedAddress} canPost={canPost} />;
}
