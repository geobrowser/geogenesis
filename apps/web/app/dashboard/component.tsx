import { TabGroup } from '~/design-system/tab-group';

import { PersonalHomeHeader } from '~/partials/personal-home/personal-home-header';
import { PersonalHomeProposalCard } from '~/partials/personal-home/personal-home-proposal-card';
import { PersonalHomeRequestsFeed } from '~/partials/personal-home/personal-home-requests-feed';
import { PersonalHomeSidebar } from '~/partials/personal-home/personal-home-sidebar';
import { PersonalHomeRequest } from '~/partials/personal-home/types';

interface Props {
  requests: PersonalHomeRequest[];
}

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Acitivity'] as const;

export function Component({ requests }: Props) {
  return (
    <div className="flex flex-col mx-28  mb-8">
      <PersonalHomeHeader />
      <div className="mb-4">
        <TabGroup
          tabs={TABS.map(label => {
            const href = label === 'For You' ? `/dashboard` : `/dashboard/${label.toLowerCase()}`;
            return {
              href,
              label,
            };
          })}
        />
      </div>
      <div className="grid grid-cols-4 w-full gap-8">
        <div className="col-span-3 flex-1">
          <div className="h-screen overflow-y-auto overscroll-contain">
            <PersonalHomeProposalCard />
            <PersonalHomeRequestsFeed requests={requests} />
          </div>
        </div>
        <div className="col-span-1">
          <PersonalHomeSidebar />
        </div>
      </div>
    </div>
  );
}
