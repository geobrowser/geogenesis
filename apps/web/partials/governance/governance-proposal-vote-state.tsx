import { SubstreamVote } from '~/core/io/schema';
import { getNoVotePercentage, getYesVotePercentage } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { TickSmall } from '~/design-system/icons/tick-small';

interface Props {
  votes: {
    totalCount: number;
    votes: SubstreamVote[];
  };

  userVote?: SubstreamVote['vote'];
  user?: {
    address?: string;
    avatarUrl: string | null;
  };
}

export function GovernanceProposalVoteState({ votes, user, userVote }: Props) {
  const yesVotesPercentage = getYesVotePercentage(votes.votes, votes.totalCount);
  const noVotesPercentage = getNoVotePercentage(votes.votes, votes.totalCount);

  return (
    <>
      <div className="flex items-center gap-2 text-metadataMedium">
        {userVote === 'ACCEPT' ? (
          <div className="relative h-3 w-3 overflow-hidden rounded-full">
            <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
          </div>
        ) : (
          <div className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <TickSmall />
          </div>
        )}
        <div className="relative h-1 w-[180px] overflow-clip rounded-full bg-grey-02">
          <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
        </div>
        <div>{yesVotesPercentage}%</div>
      </div>
      <div className="flex items-center gap-2 text-metadataMedium">
        {userVote === 'REJECT' ? (
          <div className="relative h-3 w-3 overflow-hidden rounded-full">
            <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
          </div>
        ) : (
          <div className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
            <CloseSmall />
          </div>
        )}
        <div className="relative h-1 w-[180px] overflow-clip rounded-full bg-grey-02">
          <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
        </div>
        <div>{noVotesPercentage}%</div>
      </div>
    </>
  );
}
