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

import { Text } from '~/design-system/text';

import { BountyBoardCard } from './bounty-board-card';
import { BountyBoardSkeleton } from './bounty-board-skeleton';
import { BountyFilterBar } from './bounty-filter-bar';

type Props = {
  /** Restrict to one space (the space tab). Omit for the global board across participating spaces. */
  spaceId?: string;
  /** Rendered above the filter bar (title, actions). */
  header?: React.ReactNode;
};

/** Distinct skills across the loaded bounties, sorted by name — the skill filter's options. */
export function collectSkills(bounties: readonly BoardBounty[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const bounty of bounties) for (const skill of bounty.skills) byId.set(skill.id, skill.name);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function BountyBoard({ spaceId, header }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/bounties';
  const searchParams = useSearchParams();

  const filters = React.useMemo(() => parseBountyFilters(searchParams ?? new URLSearchParams()), [searchParams]);
  const spaceIds = React.useMemo(() => (spaceId ? [spaceId] : CURRENT_BOUNTY_SPACE_IDS), [spaceId]);
  const { data, isLoading, isError, refetch } = useBoardBounties(spaceIds);

  const setFilters = React.useCallback(
    (next: BountyFilters) => {
      // The space tab pins its space; never leak a space param into its URL.
      const scoped = spaceId ? { ...next, spaceId: null } : next;
      router.replace(buildBountiesHref(pathname, scoped), { scroll: false });
    },
    [pathname, router, spaceId]
  );

  const bounties = data?.bounties ?? [];
  const skills = React.useMemo(() => collectSkills(bounties), [bounties]);
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
        spaces={spaceId ? undefined : data?.spaces}
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {group.bounties.map(bounty => (
                  <BountyBoardCard key={bounty.id} bounty={bounty} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
