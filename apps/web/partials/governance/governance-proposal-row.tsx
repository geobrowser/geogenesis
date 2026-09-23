import React from 'react';

import type { ProposalStatus } from '~/core/io/substream-schema';
import type { Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceOutcomeDate, GovernanceOutcomeTime } from './governance-outcome-timestamp';
import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';

type Props = {
  /** Already resolved — membership proposals are named after their target, edits after themselves. */
  title: string;
  /** Whoever the row is about: the proposer, or the person a membership proposal concerns. */
  profile: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'address' | 'profileLink'>;
  /** Unix seconds. Zero hides the date entirely rather than printing the epoch. */
  timestampSeconds: number;
  yesPercentage: number;
  noPercentage: number;
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
  /** The viewer, drawn on the vote bar where they voted. */
  voter?: { address?: string; avatarUrl: string | null };
  status: ProposalStatus;
  endTime: number;
  canExecute: boolean;
  /** Offers Execute in the status chip. Omit on a read-only surface. */
  executeIn?: { spaceId: string; proposalId: string };
  /**
   * Rendered at the head of the byline, before the proposer — the space, on a
   * list that spans more than one.
   *
   * In the byline rather than above the title because it is the same kind of
   * fact as the ones already there: who, where, when, separated by the same
   * dot. Above the title it read as a second heading.
   */
  bylineLead?: React.ReactNode;
  /** Rendered beside the title, e.g. the reopen menu. */
  titleAccessory?: React.ReactNode;
  /**
   * The whole-row link, drawn behind the content.
   *
   * **It has to live inside this component**, which is the mistake the
   * extraction made. Both callers had it as a preceding sibling of the row
   * instead, and the row's own root is `position: relative` — so the row's box
   * painted over an `absolute inset-0 z-0` anchor and swallowed its clicks.
   * Only the controls that carry `z-10` stayed live, which is why the byline
   * links kept working and the title stopped.
   *
   * Inside the relative root it is a sibling of the content again, the
   * arrangement that worked before: the anchor covers the row, and the handful
   * of real controls sit above it on `z-10`.
   */
  overlay?: React.ReactNode;
};

/** A share of the vote, floored. Nobody voting is 0 rather than a division by it. */
export function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

/**
 * One proposal, as the governance tab draws it.
 *
 * Extracted so a person's Proposals tab renders the identical row (GEO-2859)
 * rather than a second, subtly different proposal card. Presentation only: the
 * caller supplies the link, the ordering and the wrapper, because the two
 * surfaces disagree about all three — governance sinks and buckets its rows,
 * a record lists them newest first.
 */
export function GovernanceProposalRow({
  overlay,
  title,
  profile,
  timestampSeconds,
  yesPercentage,
  noPercentage,
  userVote,
  voter,
  status,
  endTime,
  canExecute,
  executeIn,
  bylineLead,
  titleAccessory,
}: Props) {
  const name = profile.name ?? profile.address ?? profile.id;

  const byline = (
    <>
      <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={profile.avatarUrl} value={profile.address ?? profile.id} />
      </div>
      <p className="min-w-0">{name}</p>
    </>
  );

  return (
    <div className="relative flex w-full flex-col gap-3 py-4">
      {overlay}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-smallTitle">{title}</h3>
          {titleAccessory}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-breadcrumb text-grey-04">
          {bylineLead && (
            <>
              {bylineLead}
              <span aria-hidden className="shrink-0 select-none">
                ·
              </span>
            </>
          )}
          {profile.profileLink ? (
            <Link
              href={profile.profileLink}
              className="relative z-10 flex min-w-0 items-center gap-2 transition-colors duration-75 hover:text-text"
            >
              {byline}
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2">{byline}</div>
          )}
          {timestampSeconds > 0 && (
            <>
              <span aria-hidden className="shrink-0 select-none">
                ·
              </span>
              <GovernanceOutcomeDate geoTimeSeconds={timestampSeconds} className="shrink-0" />
              <span aria-hidden className="shrink-0 select-none">
                ·
              </span>
              <GovernanceOutcomeTime geoTimeSeconds={timestampSeconds} className="shrink-0 tabular-nums" />
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="inline-flex min-w-0 flex-3 items-center gap-8">
          <GovernanceProposalVoteState
            variant="space"
            yesPercentage={yesPercentage}
            noPercentage={noPercentage}
            userVote={userVote}
            user={voter}
          />
        </div>

        <GovernanceStatusChip
          endTime={endTime}
          status={status}
          canExecute={canExecute}
          spaceId={executeIn?.spaceId}
          proposalId={executeIn?.proposalId}
        />
      </div>
    </div>
  );
}
