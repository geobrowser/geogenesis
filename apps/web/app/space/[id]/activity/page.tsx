import { Suspense } from 'react';

import { ActivityServerContainer } from '~/partials/activity/activity-server-container';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Activity(props: Props) {
  const params = await props.params;

  // @TODO add loading skeleton or spinner

  return (
    <Suspense fallback={null}>
      <ActivityServerContainer spaceId={params.id} />
    </Suspense>
  );
}
