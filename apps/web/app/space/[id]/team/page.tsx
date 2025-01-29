import { Tab } from '~/partials/tab/tab';
import { TeamNotice } from '~/partials/team/notice';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  const params = await props.params;
  const spaceId = params.id;
  return <Tab slug="team" notice={<TeamNotice spaceId={spaceId} />} params={params} />;
}
