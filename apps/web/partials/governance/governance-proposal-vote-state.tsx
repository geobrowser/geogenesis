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
  /**
   * `home` — full-width stacked bars for governance home (Review / My proposals).
   * `space` — compact side-by-side bars for per-space governance tab lists.
   */
  variant?: 'home' | 'space';
}

function YesRow({
  yesPercentage,
  userVote,
  user,
}: Pick<Props, 'yesPercentage' | 'userVote' | 'user'>) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-metadataMedium">
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
      <p className="shrink-0 tabular-nums">{yesPercentage}%</p>
    </div>
  );
}

function NoRow({
  noPercentage,
  userVote,
  user,
}: Pick<Props, 'noPercentage' | 'userVote' | 'user'>) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-metadataMedium">
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
      <p className="shrink-0 tabular-nums">{noPercentage}%</p>
    </div>
  );
}

/** Governance home: full-width stacked rows. Space governance: compact side-by-side bars. */
export function GovernanceProposalVoteState({
  yesPercentage,
  noPercentage,
  user,
  userVote,
  variant = 'home',
}: Props) {
  if (variant === 'space') {
    // Always side-by-side (matches prod space governance); never stack like governance home.
    return (
      <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-4 min-[480px]:gap-6">
        <YesRow yesPercentage={yesPercentage} userVote={userVote} user={user} />
        <NoRow noPercentage={noPercentage} userVote={userVote} user={user} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <YesRow yesPercentage={yesPercentage} userVote={userVote} user={user} />
      <NoRow noPercentage={noPercentage} userVote={userVote} user={user} />
    </div>
  );
}
