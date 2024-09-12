import { Tab } from '~/partials/tab/tab';
import { TeamNotice } from '~/partials/team/notice';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  const spaceId = props.params.id;

  return <Tab slug="team" notice={<TeamNotice spaceId={spaceId} />} {...props} />;
}
