import * as React from 'react';

import ActivityLayout from '~/partials/activity/activity-layout';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  children: React.ReactNode;
}

export default async function Layout(props: Props) {
  const params = await props.params;

  const {
    children
  } = props;

  return <ActivityLayout params={params}>{children}</ActivityLayout>;
}
