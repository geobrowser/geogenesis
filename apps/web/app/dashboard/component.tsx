import { TabGroup } from '~/design-system/tab-group';

import { PersonalHomeFilter } from '~/partials/personal-home/personal-home-filter';
import { PersonalHomeHeader } from '~/partials/personal-home/personal-home-header';
import { PersonalHomeProposalsFeed } from '~/partials/personal-home/personal-home-proposals-feed';
import { PersonalHomeRequestsFeed } from '~/partials/personal-home/personal-home-requests-feed';
import { PersonalHomeSidebar } from '~/partials/personal-home/personal-home-sidebar';
import { PersonalHomeRequest, VoteProposal } from '~/partials/personal-home/types';

interface Props {
  requests: PersonalHomeRequest[];
  voteProposals: VoteProposal[];
}

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

/*
considerations & notes:
  - pass in the processed lengths for requests / vote proposals into the sidebar
    instead of passing all of the data in -- saves on passing unnecessary data since likely won't need it
  - any admin will be able to approve/reject requests, so we'll need to be able to remove requests from feed if they are approved/rejected
    - sidebar number values will need to reflect this
  - tabs will each be their own route with their own data fetching -- right now only the 'For You' tab is mocked
    - considering best approach for rendering the count within each tab since we want to fetch data per tab
  - subscription? -- we'll want to be able to keep the data from getting too stale for folks looking at this as an activity dashboard/hub
*/

export function Component({ requests, voteProposals }: Props) {
  return (
    <div className="h-screen flex flex-col mx-28  mb-8 ">
      <PersonalHomeHeader />
      <TabGroup
        tabs={TABS.map(label => {
          const href = label === 'For You' ? `/dashboard` : `/dashboard/${label.toLowerCase()}`;
          return {
            href,
            label,
          };
        })}
      />
      <div className="my-4">
        <PersonalHomeFilter />
      </div>
      <div className="flex-1 grid grid-cols-4 w-full gap-8 overflow-y-auto ">
        <div className="col-span-3 flex-1 overflow-y-scroll pr-8">
          <PersonalHomeProposalsFeed voteProposals={voteProposals} />
          <PersonalHomeRequestsFeed requests={requests} />
        </div>
        <div className="col-span-1 flex-1">
          <PersonalHomeSidebar voteProposals={voteProposals} requests={requests} />
        </div>
      </div>
    </div>
  );
}
