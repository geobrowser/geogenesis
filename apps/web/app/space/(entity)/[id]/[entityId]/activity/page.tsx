import { ActivityPage } from '~/partials/activity/activity-page';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    spaceId?: string;
  };
}

// The ActivityPage component is used both on the [entityId]/activity route
// and the space/[id]/activity route. We can share the components for this
// layout by using the same component for both routes.
export default function Activity({ params, searchParams }: Props) {
  return <ActivityPage params={params} searchParams={searchParams} />;
}
