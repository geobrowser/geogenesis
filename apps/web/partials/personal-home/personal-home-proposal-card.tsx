import { cva } from 'class-variance-authority';

import { Avatar } from '~/design-system/avatar';
import { IconButton } from '~/design-system/button';
import { Icon } from '~/design-system/icon';
import { Text } from '~/design-system/text';

import { VoteProposal } from './types';

function getTimeToVoteEnd(endDate: string): string {
  /* adding this function in to mock the time -- likely unneeded since we have other date time conversion utils
  but included to match the design and to anticipate the value format
  */
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
  // const seconds = differenceInSeconds.toString().padStart(2, '0');

  return `${hours}h ${minutes}min`; // removing seconds since it's no longer in the design but leaving in incase we want to add back in
}

function VoteTime({ endDate }: { endDate: VoteProposal['endDate'] }) {
  return (
    <div className="flex flex-row items-center bg-divider py-1.5 px-2 rounded-sm gap-1.5">
      <Icon icon="time" color="grey-04" />
      <Text variant="smallButton" color="grey-04">
        {getTimeToVoteEnd(endDate.value)} remaining
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
        pending: '', // satisfies TS issue for missing types -- temporary, will troubleshoot why Pick didn't work
        canceled: '', // satisfies TS issue for missing types -- temporary, will troubleshoot why Pick didn't work
      },
    },
  });

  // the endDate.value conversion is verbose and likely ultimately unnecessary, but adding to match the design while anticipating the value format
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

function VoteProgressBar({ votes, voteType }: { votes: VoteProposal['votes']; voteType: 'yes' | 'no' }) {
  const votePercentage = (votes.filter(vote => vote.value === voteType).length / votes.length) * 100;

  // @TODO: see if the variable width can be included in the cva styles instead of in the style prop -- it renders only one bar when using cva
  const voteStyles = cva('absolute left-0 top-0 h-1 rounded', {
    variants: {
      voteType: {
        yes: 'bg-green',
        no: 'bg-red-01',
      },
    },
  });
  return (
    <div className="relative w-full h-1 bg-grey-02 rounded">
      <div className={voteStyles({ voteType })} style={{ width: `${votePercentage}%` }} />
    </div>
  );
}

function VoteActionBar({ votes, voteType }: { votes: VoteProposal['votes']; voteType: 'yes' | 'no' }) {
  const votePercentage =
    votes.length !== 0 ? (votes.filter(vote => vote.value === voteType).length / votes.length) * 100 : 0; // check for NaN here and if votes are 0 return 0
  return (
    <div className="flex flex-row items-center w-full justify-between mb-2">
      <Text variant="metadata">{voteType === 'yes' ? 'Accepted' : 'Rejected'}</Text>
      <div className="flex flex-row items-center gap-4">
        <Text variant="metadata">{votes.filter(vote => vote.value === voteType).length} votes</Text>
        <Text variant="metadata">{votePercentage}%</Text>
        <IconButton icon={voteType === 'yes' ? 'tick' : 'close'} className="border border-grey-02 rounded-sm p-1.5" />
      </div>
    </div>
  );
}

export function PersonalHomeProposalCard({ name, createdBy, space, status, endDate, votes }: VoteProposal) {
  return (
    <div className="flex flex-col border border-grey-02 rounded-[12px] grey-02 p-4 shadow-light">
      <Text variant="smallTitle">{name}</Text>
      <div className="flex flex-row items-center gap-4 mt-2">
        <div className="flex flex-row items-center gap-1.5">
          <div className="relative rounded-full overflow-hidden">
            <Avatar size={12} />
          </div>
          <Text variant="breadcrumb">{createdBy}</Text>
        </div>
        <div className="flex flex-row items-center gap-1.5">
          <div className="w-3 h-3 bg-purple rounded-sm" />
          <Text variant="breadcrumb" color="grey-04">
            {space}
          </Text>
        </div>
      </div>
      <div className="flex flex-row  justify-between w-full mt-4 ">
        {status === 'pending' ? <VoteTime endDate={endDate} /> : <VoteStatus status={status} endDate={endDate} />}
      </div>
      <div className="flex flex-col mt-5 mb-4">
        <VoteActionBar votes={votes} voteType="yes" />
        <VoteProgressBar votes={votes} voteType="yes" />
      </div>
      <div className="flex flex-col">
        <VoteActionBar votes={votes} voteType="no" />
        <VoteProgressBar votes={votes} voteType="no" />
      </div>
    </div>
  );
}
