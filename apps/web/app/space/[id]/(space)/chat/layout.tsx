import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { SpaceChatTab } from '~/partials/space-chat/space-chat-tab';

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * A space's Chat tab (GEO-3422). Its reads are geo-chat's and run client-side. A layout, so moving
 * between channels (GEO-3818) keeps the tab mounted; the pages under it render nothing.
 */
export default async function SpaceChatLayout(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <SpaceChatTab spaceId={params.id} />
      {props.children}
    </EntityPageContentContainer>
  );
}
