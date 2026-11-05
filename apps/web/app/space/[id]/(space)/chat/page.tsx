import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { SpaceChatTab } from '~/partials/space-chat/space-chat-tab';

interface Props {
  params: Promise<{ id: string }>;
}

/** A space's Chat tab (GEO-3422). Its reads are geo-chat's and run client-side. */
export default async function SpaceChat(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <SpaceChatTab spaceId={params.id} />
    </EntityPageContentContainer>
  );
}
