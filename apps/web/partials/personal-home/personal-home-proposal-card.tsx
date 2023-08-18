import { cva } from 'class-variance-authority';

import { Avatar } from '~/design-system/avatar';
import { Icon } from '~/design-system/icon';
import { Text } from '~/design-system/text';

import { VoteProposal } from './types';

/* adding this in to mock the time -- likely unneeded since we have other date time conversion utils
  but included to match the design and to anticipate the value format 
*/

function getTimeToVoteEnd(endDate: string): string {
  const future = new Date(endDate);
  const now = new Date();
  let differenceInSeconds = Math.floor((future.getTime() - now.getTime()) / 1000);

  if (differenceInSeconds < 0) {
    return 'Proposal endDate cannot be in the past for calculating the remaining vote time.';
  }

  const hours = Math.floor(differenceInSeconds / 3600)
    .toString()
    .padStart(2, '0');
  differenceInSeconds %= 3600;
  const minutes = Math.floor(differenceInSeconds / 60)
    .toString()
    .padStart(2, '0');
  differenceInSeconds %= 60;
  const seconds = differenceInSeconds.toString().padStart(2, '0');

  return `${hours} : ${minutes} : ${seconds}`;
}

function VoteTime({ endDate }: { endDate: VoteProposal['endDate'] }) {
  return (
    <div className="flex flex-row items-center bg-successTertiary py-1.5 px-2 rounded-sm gap-1.5">
      <Icon icon="time" color="green" />
      <Text variant="smallButton" className="success text-green">
        {getTimeToVoteEnd(endDate.value)}
      </Text>
    </div>
  );
}

function VoteStatus({ status, endDate }: { status: VoteProposal['status']; endDate: VoteProposal['endDate'] }) {
  const voteStatusStyles = cva('flex flex-row items-center py-1.5 px-2 rounded-sm gap-1.5', {
    variants: {
      status: {
        approved: 'bg-green',
        rejected: 'bg-red-01',
        pending: '', // satisfies TS issue -- temporary, will troubleshoot why Pick didn't work
        canceled: '', // satisfies TS issue -- temporary, will troubleshoot why Pick didn't work
      },
    },
  });

  // the endDate.value conversion is verbose and likely unnecessary, but adding to match the design while anticipating the value format
  return (
    <div className={voteStatusStyles({ status })}>
      <Text variant="smallButton" className="text-white">
        {`${status.charAt(0).toUpperCase()}${status.slice(1)}`} &#183;{' '}
        {endDate.value
          .split('-')
          .reverse()
          .join(' ')
          .replace(
            / (\d\d) /,
            ' ' +
              ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
                parseInt(endDate.value.split('-')[1]) - 1
              ] +
              ', '
          )}
      </Text>
    </div>
  );
}

export function PersonalHomeProposalCard({ name, createdBy, space, status, time, endDate, votes }: VoteProposal) {
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
        {status === 'pending' ? (
          <VoteTime endDate={endDate} time={time} />
        ) : (
          <VoteStatus status={status} endDate={endDate} />
        )}
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
