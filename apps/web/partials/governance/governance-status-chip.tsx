import { ProposalStatus } from '@graphprotocol/grc-20';

import { getProposalTimeRemaining } from '~/core/utils/utils';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

import { CheckSuccess } from './check-success';

interface Props {
  status: ProposalStatus;
  endTime: number; // UNIX timestamp
  yesPercentage: number;
}

export function GovernanceStatusChip({ status, endTime, yesPercentage }: Props) {
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
      const { hours, minutes, seconds } = getProposalTimeRemaining(endTime);
      const isAwaitingExecution = seconds <= 0;
      const isRejected = isAwaitingExecution && yesPercentage <= 50;

      let statusText = `${hours}h ${minutes}m remaining`;

      if (isAwaitingExecution) {
        statusText = 'Pending execution';
      }

      if (isRejected) {
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

      return <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium">{statusText}</div>;
    }
    default:
      throw new Error(`${status} proposal status not implemented yet`);
  }
}
