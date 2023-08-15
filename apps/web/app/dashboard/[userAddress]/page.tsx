import { PersonalHomeHeader } from '~/partials/personal-home/personal-home-header';
import { PersonalHomeSidebar } from '~/partials/personal-home/personal-home-sidebar';

import { PersonalHomeRequestsFeed } from '../../../partials/personal-home/personal-home-requests-feed';

const mockJoinProps = [
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
  },
];

export default function PersonalSpace() {
  return (
    <div className="flex flex-col mx-28">
      <PersonalHomeHeader />
      <PersonalHomeSidebar />
      <PersonalHomeRequestsFeed requests={mockJoinProps} />
    </div>
  );
}
