import { Avatar } from '~/design-system/avatar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { TickSmall } from '~/design-system/icons/tick-small';

interface Props {
  yesPercentage: number;
  noPercentage: number;

  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
  user?: {
    address?: string;
    avatarUrl: string | null;
  };
}

/** Matches governance home “Review proposals” card bars: full-width progress rows. */
export function GovernanceProposalVoteState({ yesPercentage, noPercentage, user, userVote }: Props) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2 text-metadataMedium">
        {userVote === 'ACCEPT' ? (
          <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
            <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
          </div>
        ) : (
          <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
            <TickSmall />
          </div>
        )}
        <div className="relative h-1 min-w-0 flex-1 overflow-clip rounded-full bg-grey-02">
          <div className="absolute top-0 bottom-0 left-0 bg-green" style={{ width: `${yesPercentage}%` }} />
        </div>
        <p className="shrink-0">{yesPercentage}%</p>
      </div>
      <div className="flex items-center gap-2 text-metadataMedium">
        {userVote === 'REJECT' ? (
          <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
            <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
          </div>
        ) : (
          <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
            <CloseSmall />
          </div>
        )}
        <div className="relative h-1 min-w-0 flex-1 overflow-clip rounded-full bg-grey-02">
          <div className="absolute top-0 bottom-0 left-0 bg-red-01" style={{ width: `${noPercentage}%` }} />
        </div>
        <p className="shrink-0">{noPercentage}%</p>
      </div>
    </div>
  );
}
