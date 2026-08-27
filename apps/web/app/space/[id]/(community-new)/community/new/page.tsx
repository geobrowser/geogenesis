import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { CallForm } from '~/partials/community-calls/call-form';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewCommunityCallPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return <CallForm mode="create" spaceId={params.id} />;
}
