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
  compactTrack,
}: Pick<Props, 'yesPercentage' | 'userVote' | 'user'> & { compactTrack?: boolean }) {
  const trackClass = compactTrack
    ? 'relative h-1 w-[180px] shrink-0 overflow-clip rounded-full bg-grey-02'
    : 'relative h-1 min-w-0 flex-1 overflow-clip rounded-full bg-grey-02';
  const rowClass = compactTrack
    ? 'flex items-center gap-2 text-metadataMedium'
    : 'flex min-w-0 flex-1 items-center gap-2 text-metadataMedium';

  return (
    <div className={rowClass}>
      {userVote === 'ACCEPT' ? (
        <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
        </div>
      ) : (
        <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
          <TickSmall />
        </div>
      )}
      <div className={trackClass}>
        <div className="absolute top-0 bottom-0 left-0 bg-green" style={{ width: `${yesPercentage}%` }} />
      </div>
      <div className="shrink-0 tabular-nums">{yesPercentage}%</div>
    </div>
  );
}

function NoRow({
  noPercentage,
  userVote,
  user,
  compactTrack,
}: Pick<Props, 'noPercentage' | 'userVote' | 'user'> & { compactTrack?: boolean }) {
  const trackClass = compactTrack
    ? 'relative h-1 w-[180px] shrink-0 overflow-clip rounded-full bg-grey-02'
    : 'relative h-1 min-w-0 flex-1 overflow-clip rounded-full bg-grey-02';
  const rowClass = compactTrack
    ? 'flex items-center gap-2 text-metadataMedium'
    : 'flex min-w-0 flex-1 items-center gap-2 text-metadataMedium';

  return (
    <div className={rowClass}>
      {userVote === 'REJECT' ? (
        <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
        </div>
      ) : (
        <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
          <CloseSmall />
        </div>
      )}
      <div className={trackClass}>
        <div className="absolute top-0 bottom-0 left-0 bg-red-01" style={{ width: `${noPercentage}%` }} />
      </div>
      <div className="shrink-0 tabular-nums">{noPercentage}%</div>
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
    // Matches prod Geo: two rows, w-[180px] tracks, gap-8 between them (parent adds flex-3 wrapper).
    return (
      <div className="inline-flex items-center gap-8">
        <YesRow compactTrack yesPercentage={yesPercentage} userVote={userVote} user={user} />
        <NoRow compactTrack noPercentage={noPercentage} userVote={userVote} user={user} />
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
