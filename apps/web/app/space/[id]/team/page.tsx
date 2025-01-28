import { Tab } from '~/partials/tab/tab';
import { TeamNotice } from '~/partials/team/notice';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  const spaceId = (await props.params).id;

  return (
    <Tab slug="team" notice={<TeamNotice spaceId={spaceId} />} /* @next-codemod-error 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
    {...props} />
  );
}
