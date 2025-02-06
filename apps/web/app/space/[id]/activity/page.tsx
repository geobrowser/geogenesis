import { ActivityPage } from '~/partials/activity/activity-page';

import { cachedFetchSpace } from '../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    spaceId?: string;
  }>;
}

// The ActivityPage component is used both on the [entityId]/activity route
// and the space/[id]/activity route. We can share the components for this
// layout by using the same component for both routes.
export default async function Activity(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const space = await cachedFetchSpace(params.id);

  return <ActivityPage entityId={space?.spaceConfig?.id ?? null} searchParams={searchParams} />;
}
