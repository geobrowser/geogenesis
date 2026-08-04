import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebatesPageClient } from './debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebatesPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  // Full-bleed: no content-width container. The feed fills the viewport itself.
  return <DebatesPageClient spaceId={params.id} />;
}
