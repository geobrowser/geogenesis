import { Props, Tab } from '~/partials/tab/tab';
import { TeamNotice } from '~/partials/team/notice';

export default async function Page(props: Props) {
  const spaceId = props.params.id;

  return <Tab slug="team" notice={<TeamNotice spaceId={spaceId} />} {...props} />;
}
