'use client';

import * as React from 'react';

import { difficultyKeyForId } from '~/core/bounties/labels';
import type { BoardBounty } from '~/core/bounties/types';
import { BOUNTY_EST_PAYOUT_RATIO, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { Gem } from '~/design-system/icons/gem';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Tag } from '~/design-system/tag';

/**
 * Curator-app's board card shows the *minimum* expected payout for medium and
 * hard bounties (a fixed share of the budget) and the flat budget for easy
 * ones. Mirror that so both apps quote the same number for the same bounty.
 */
export function displayedPayout(bounty: Pick<BoardBounty, 'budget' | 'difficultyId'>): number | null {
  if (bounty.budget == null) return null;
  const key = difficultyKeyForId(bounty.difficultyId);
  return key === 'easy' || key === null ? bounty.budget : Math.round(bounty.budget * BOUNTY_EST_PAYOUT_RATIO);
}

export function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isBountyEnded(deadline: string | null, now: number = Date.now()): boolean {
  if (!deadline) return false;
  const ms = Date.parse(deadline);
  return Number.isFinite(ms) && ms < now;
}

export function BountyBoardCard({ bounty }: { bounty: BoardBounty }) {
  const payout = displayedPayout(bounty);
  const payoutIsMinimum = payout != null && payout !== bounty.budget;
  const deadline = formatDeadline(bounty.deadline);
  const ended = isBountyEnded(bounty.deadline);
  const contributors = bounty.maxContributors != null ? bounty.maxContributors.toLocaleString('en-US') : 'Unlimited';

  return (
    <Link
      href={NavUtils.toBounty(bounty.spaceId, bounty.id)}
      data-testid="bounty-board-card"
      className="group flex min-h-[220px] flex-col rounded-lg border border-grey-02 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-dropdown"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="relative inline-flex size-[16px] shrink-0 items-center justify-center overflow-hidden rounded-sm">
            <ThumbGeoImage
              value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0 truncate text-metadata text-grey-04">{bounty.spaceLabel ?? bounty.spaceId}</span>
        </span>
        {payout != null ? (
          <Tag className="flex shrink-0 items-center gap-1 bg-purple/10 px-1.5 py-0.5 text-purple group-hover:bg-purple group-hover:text-white">
            <Gem color="purple" />
            <span className="text-metadataMedium">
              {payoutIsMinimum ? `${payout.toLocaleString('en-US')}+` : payout.toLocaleString('en-US')}
            </span>
          </Tag>
        ) : null}
      </div>

      <h3 className="mt-3 line-clamp-2 text-smallTitle text-text">{bounty.name}</h3>
      {bounty.description ? (
        <p className="mt-1.5 line-clamp-3 text-metadata text-grey-04">{bounty.description}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-metadata text-grey-04">
        <span>
          <span className="text-grey-03">Contributors</span> {contributors}
        </span>
        {bounty.difficulty ? (
          <span>
            <span className="text-grey-03">Difficulty</span> {bounty.difficulty}
          </span>
        ) : null}
        {deadline ? (
          <span className={ended ? 'text-red-01' : undefined}>
            <span className="text-grey-03">{ended ? 'Ended' : 'Due'}</span> {deadline}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
