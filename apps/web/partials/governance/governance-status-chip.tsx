import { ProposalStatus } from '@geogenesis/sdk';

import { GeoDate } from '~/core/utils/utils';

interface Props {
  status: ProposalStatus;
  startTime: number; // UNIX timestamp
  endTime: number; // UNIX timestamp
}

export function GovernanceStatusChip({ status, startTime, endTime }: Props) {
  switch (status) {
    case 'ACCEPTED': {
      return <span className="rounded-sm bg-green px-2 py-1.5 text-smallButton text-white">Accepted</span>;
    }
    case 'PROPOSED': {
      const timeRemaining = Math.floor(endTime - Date.now() / 1000);
      const isAwaitingExecution = timeRemaining <= 0;

      return (
        <span className="rounded-sm bg-divider px-2 py-1.5 text-smallButton text-grey-04">
          {isAwaitingExecution ? 'Pending execution' : `${timeRemaining} seconds remaining`}
        </span>
      );
    }
    default:
      throw new Error(`${status} proposal status not implemented yet`);
  }
}
