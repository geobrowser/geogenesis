import { PersonalHomeHeader } from '~/partials/personal-home/personal-home-header';
import { PersonalHomeRequestsFeed } from '~/partials/personal-home/personal-home-requests-feed';
import { PersonalHomeSidebar } from '~/partials/personal-home/personal-home-sidebar';
import { PersonalHomeRequest } from '~/partials/personal-home/types';

interface Props {
  requests: PersonalHomeRequest[];
}

export function Component({ requests }: Props) {
  return (
    <div className="flex flex-col mx-28 h-screen mb-8">
      <PersonalHomeHeader />
      <div className="grid grid-cols-4 w-full gap-8 overflow-hidden">
        <div className="col-span-3 flex-1 overflow-y-scroll">
          <PersonalHomeRequestsFeed requests={requests} />
        </div>
        <div className="col-span-1">
          <PersonalHomeSidebar />
        </div>
      </div>
    </div>
  );
}
