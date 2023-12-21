import * as React from 'react';

import ActivityLayout from '~/partials/activity/activity-layout';

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export default function Layout({ params, children }: Props) {
  return <ActivityLayout params={params}>{children}</ActivityLayout>;
}
