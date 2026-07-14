import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { CommunityCallFlow } from '~/partials/community-calls/community-call-flow';

type Props = {
  params: Promise<{ id: string; callId: string }>;
};

export default async function CommunityCallPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.callId)) {
    notFound();
  }

  return <CommunityCallFlow spaceId={params.id} callId={params.callId} />;
}
