import { ProposalStatus } from '~/core/io/substream-schema';
import { getProposalTimeRemaining } from '~/core/utils/utils';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

import { CheckSuccess } from './check-success';

interface Props {
  status: ProposalStatus;
  endTime: number; // UNIX timestamp
  canExecute: boolean;
  /** When set while voting is still open, do not repeat the same countdown as the card footer. */
  viewerVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
}

export function GovernanceStatusChip({ status, endTime, canExecute, viewerVote }: Props) {
  switch (status) {
    case 'ACCEPTED': {
      return (
        <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium text-green">
          {/* Optically align the icon */}
          <div className="mt-[0.75px]">
            <CheckSuccess />
          </div>
          Accepted
        </div>
      );
    }
    case 'PROPOSED': {
      const { days, hours, minutes, seconds } = getProposalTimeRemaining(endTime);
      const totalSecondsRemaining = days * 86400 + hours * 3600 + minutes * 60 + seconds;
      const isVotingEnded = totalSecondsRemaining <= 0;

      if (isVotingEnded && !canExecute) {
        return (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium text-red-01">
            {/* Optically align the icon */}
            <div className="mt-[0.75px]">
              <CheckCloseSmall />
            </div>
            Rejected
          </div>
        );
      }

      if (isVotingEnded) {
        return (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium">Pending execution</div>
        );
      }

      if (viewerVote) {
        return (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium text-grey-04">
            Voting period open
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium">{`${hours}h ${minutes}m remaining`}</div>
      );
    }
    case 'REJECTED': {
      return (
        <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium text-red-01">
          {/* Optically align the icon */}
          <div className="mt-[0.75px]">
            <CheckCloseSmall />
          </div>
          Rejected
        </div>
      );
    }
    default:
      throw new Error(`${status} proposal status not implemented yet`);
  }
}
