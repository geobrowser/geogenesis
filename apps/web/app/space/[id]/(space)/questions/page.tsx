import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClaimsRedirectPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  redirect(`/space/${params.id}/claims`);
}
