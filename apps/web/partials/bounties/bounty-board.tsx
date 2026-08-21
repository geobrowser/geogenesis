'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { CURRENT_BOUNTY_SPACE_IDS } from '~/core/bounties/constants';
import {
  type BountyFilters,
  applyBountyFilters,
  buildBountiesHref,
  groupBounties,
  parseBountyFilters,
  sortBounties,
} from '~/core/bounties/filters';
import type { BoardBounty } from '~/core/bounties/types';
import { useBoardBounties } from '~/core/bounties/use-bounties';
import { useInterestedBountyIds, useInterestedInBounty } from '~/core/community/use-interested-in-bounty';

import { Text } from '~/design-system/text';

import { BoardBountyCard, type BoardInterestBindings } from './board-bounty-card';
import { BountyBoardSkeleton } from './bounty-board-skeleton';
import { BountyFilterBar } from './bounty-filter-bar';

type Props = {
  /** Rendered above the filter bar (title, actions). */
  header?: React.ReactNode;
};

/** Distinct skills across the loaded bounties, sorted by name — the skill filter's options. */
export function collectSkills(bounties: readonly BoardBounty[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const bounty of bounties) for (const skill of bounty.skills) byId.set(skill.id, skill.name);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function BountyBoard({ header }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/bounties';
  const searchParams = useSearchParams();

  const filters = React.useMemo(() => parseBountyFilters(searchParams ?? new URLSearchParams()), [searchParams]);
  const spaceIds = CURRENT_BOUNTY_SPACE_IDS;
  const { data, isLoading, isError, refetch } = useBoardBounties(spaceIds);

  const setFilters = React.useCallback(
    (next: BountyFilters) => {
      router.replace(buildBountiesHref(pathname, next), { scroll: false });
    },
    [pathname, router]
  );

  const bounties = React.useMemo(() => data?.bounties ?? [], [data?.bounties]);
  const skills = React.useMemo(() => collectSkills(bounties), [bounties]);

  // One interest query for every loaded bounty; the available cards bind to it.
  const bountyIds = React.useMemo(() => bounties.map(bounty => bounty.id), [bounties]);
  const { interestedIds, isLoading: isInterestLoading } = useInterestedBountyIds(bountyIds);
  const { registerInterest, pendingBountyId, canRegisterInterest } = useInterestedInBounty();
  const interest: BoardInterestBindings = React.useMemo(
    () => ({
      interestedIds,
      isInterestLoading,
      canRegisterInterest,
      pendingBountyId,
      onRegisterInterest: target =>
        void registerInterest({ bountyId: target.id, bountyName: target.name, bountySpaceId: target.spaceId }),
    }),
    [canRegisterInterest, interestedIds, isInterestLoading, pendingBountyId, registerInterest]
  );
  const groups = React.useMemo(() => {
    const visible = sortBounties(applyBountyFilters(bounties, filters), filters.sort);
    return groupBounties(visible, filters.groupBy, spaceIds);
  }, [bounties, filters, spaceIds]);
  const visibleCount = groups.reduce((sum, group) => sum + group.bounties.length, 0);

  return (
    <div className="flex flex-col gap-6" data-testid="bounty-board">
      {header}
      <BountyFilterBar
        filters={filters}
        onChange={setFilters}
        bounties={bounties}
        spaces={data?.spaces}
        skills={skills}
      />

      {isLoading ? (
        <BountyBoardSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-grey-02 bg-white p-6 text-center">
          <Text as="p" color="grey-04">
            Couldn't load bounties.
          </Text>
          <button type="button" onClick={() => refetch()} className="mt-2 text-button text-ctaPrimary hover:underline">
            Try again
          </button>
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-lg border border-grey-02 bg-white p-6 text-center">
          <Text as="p" color="grey-04">
            {bounties.length === 0 ? 'No bounties yet.' : 'No bounties match these filters.'}
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(group => (
            <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
              {filters.groupBy !== 'none' ? (
                <div className="flex items-baseline gap-2">
                  <Text as="h2" variant="smallTitle">
                    {group.label}
                  </Text>
                  <Text variant="metadata" color="grey-04">
                    {group.bounties.length}
                  </Text>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-4">
                {group.bounties.map(bounty => (
                  <BoardBountyCard key={bounty.id} bounty={bounty} interest={interest} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
