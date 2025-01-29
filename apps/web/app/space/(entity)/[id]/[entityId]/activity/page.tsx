import { ActivityPage } from '~/partials/activity/activity-page';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
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
  return <ActivityPage entityId={params.entityId} searchParams={searchParams} />;
}
