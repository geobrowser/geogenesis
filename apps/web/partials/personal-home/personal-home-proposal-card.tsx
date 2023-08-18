import { Avatar } from '~/design-system/avatar';
import { Icon } from '~/design-system/icon';
import { Text } from '~/design-system/text';

import { PersonalHomeVoteActionBar } from './personal-home-vote-action-bar';
import { VoteProposal } from './types';

function VoteTime({ time }: { time: VoteProposal['time'] }) {
  return (
    <div className="flex flex-row items-center bg-successTertiary py-1.5 px-2 rounded-sm gap-1.5">
      <Icon icon="time" color="green" />
      <Text variant="smallButton" className="success text-green">
        {time}
      </Text>
    </div>
  );
}

function VoteStatus({ status }: { status: VoteProposal['status'] }) {
  const statusConversion = status === 'approved' ? 'Approved' : 'Rejected';
  const statusColors = status === 'approved' ? 'green' : 'red-01';

  return (
    <div className={'flex flex-row items-center bg-successTertiary py-1.5 px-2 rounded-sm gap-1.5'}>
      <Text>{status}</Text>
    </div>
  );
}

export function PersonalHomeProposalCard({ name, createdBy, space, status, time, votes }: VoteProposal) {
  return (
    <div className="flex flex-col border border-grey-02 rounded-[12px] grey-02 p-4 shadow-light">
      <Text variant="smallTitle">{name}</Text>
      <div className="flex flex-row items-center gap-4 mt-2">
        <div className="relative rounded-sm overflow-hidden">
          <Avatar size={12} />
        </div>
        <Text variant="breadcrumb">{createdBy}</Text>
      </div>
      <div className="flex flex-row  justify-between w-full mt-4 ">
        <VoteTime time={time} />
        <div className="flex flex-row items-center gap-2">
          <div className="w-3 h-3 bg-purple rounded-sm" />
          <Text variant="breadcrumb" color="grey-04">
            {space}
          </Text>
        </div>
      </div>
    </div>
  );
}
