'use client';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { ProposalStatus } from '~/core/io/substream-schema';
import { getProposalTimeRemaining } from '~/core/utils/utils';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';

import { Execute } from '~/partials/active-proposal/execute';

import { CheckSuccess } from './check-success';

interface Props {
  status: ProposalStatus;
  endTime: number; // UNIX timestamp
  canExecute: boolean;
  /** When set while voting is still open, do not repeat the same countdown as the card footer. */
  viewerVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
  /** Pass `spaceId` + `proposalId` to offer an Execute button (eligible users) in place of the "Pending execution" label. */
  spaceId?: string;
  proposalId?: string;
}

export function GovernanceStatusChip({ status, endTime, canExecute, viewerVote, spaceId, proposalId }: Props) {
  const { smartAccount } = useSmartAccount();
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
      const isVotingEnded = endTime > 0 && totalSecondsRemaining <= 0;

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
        const pendingExecutionLabel = (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium">Pending execution</div>
        );

        // Offer the Execute button so curators can unstick a passed proposal from
        // the list instead of only from the proposal detail page. Execute()
        // self-gates on a registered personal space + an on-chain simulation,
        // falling back to the label while it checks or when the user can't
        // execute — so the status is never blank.
        if (smartAccount && spaceId && proposalId) {
          return (
            <div className="relative z-10">
              <Execute spaceId={spaceId} proposalId={proposalId} variant="small" fallback={pendingExecutionLabel} />
            </div>
          );
        }

        return pendingExecutionLabel;
      }

      if (viewerVote) {
        return (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium text-grey-04">
            Voting period open
          </div>
        );
      }

      if (endTime <= 0) {
        return (
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-metadataMedium">
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
