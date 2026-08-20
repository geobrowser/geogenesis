'use client';

import * as React from 'react';

import cx from 'classnames';

import { type BountyDetail, distinctInterestedIds } from '~/core/bounties/fetch-bounty-detail';
import { useBountyAllocationActions } from '~/core/bounties/use-bounty-actions';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';
import { useEntityNames } from '~/core/bounties/use-entity-names';
import { uuidToHex } from '~/core/id/normalize';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

type Props = {
  detail: BountyDetail;
  roles: BountyRoles;
};

type Tab = 'allocated' | 'interested';

/** Allocated / Interested curators, with allocate/remove actions for editors. */
export function BountyAllocationTabs({ detail, roles }: Props) {
  const [tab, setTab] = React.useState<Tab>('allocated');
  const actions = useBountyAllocationActions(detail);

  const allocatedIds = React.useMemo(() => [...new Set(detail.bounty.allocatedIds.map(uuidToHex))], [detail]);
  const interestedIds = React.useMemo(
    () => distinctInterestedIds(detail.interest, detail.bounty.spaceId),
    [detail.interest, detail.bounty.spaceId]
  );
  const allocatedSet = React.useMemo(() => new Set(allocatedIds), [allocatedIds]);
  const names = useEntityNames([...allocatedIds, ...interestedIds]);

  const spotsLeft =
    detail.bounty.maxContributors != null ? Math.max(0, detail.bounty.maxContributors - allocatedIds.length) : null;

  const rows = tab === 'allocated' ? allocatedIds : interestedIds;
  const label = (id: string): string => names.data?.get(id)?.trim() || `${id.slice(0, 6)}…${id.slice(-4)}`;

  return (
    <section aria-label="Curators" data-testid="bounty-allocation-tabs" className="flex flex-col gap-3">
      <div className="flex items-center gap-4 border-b border-grey-02">
        <TabButton active={tab === 'allocated'} onClick={() => setTab('allocated')}>
          Allocated <Count>{allocatedIds.length}</Count>
        </TabButton>
        <TabButton active={tab === 'interested'} onClick={() => setTab('interested')}>
          Interested <Count>{interestedIds.length}</Count>
        </TabButton>
        {spotsLeft != null ? (
          <Text variant="metadata" color="grey-04" className="ml-auto">
            {spotsLeft} of {detail.bounty.maxContributors} spots open
          </Text>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Text variant="metadata" color="grey-04">
          {tab === 'allocated' ? 'No curators allocated yet.' : 'No one has expressed interest yet.'}
        </Text>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-02">
          {rows.map(id => {
            const isAllocated = allocatedSet.has(id);
            const pending = actions.pendingTargetId != null && uuidToHex(actions.pendingTargetId) === id;
            return (
              <li key={id} className="flex items-center justify-between gap-3 py-2" data-testid="curator-row">
                <Link
                  href={NavUtils.toEntity(detail.bounty.spaceId, id)}
                  className="min-w-0 truncate text-metadata hover:underline"
                >
                  {label(id)}
                </Link>
                {roles.isEditor ? (
                  tab === 'allocated' ? (
                    <SmallButton disabled={pending} onClick={() => void actions.remove(id)}>
                      {pending ? 'Removing…' : 'Remove'}
                    </SmallButton>
                  ) : isAllocated ? (
                    <Text variant="metadata" color="grey-04">
                      Allocated
                    </Text>
                  ) : (
                    <SmallButton
                      disabled={pending || spotsLeft === 0}
                      onClick={() => void actions.allocate({ spaceId: id, name: names.data?.get(id) ?? null })}
                    >
                      {pending ? 'Allocating…' : 'Allocate'}
                    </SmallButton>
                  )
                ) : isAllocated && tab === 'interested' ? (
                  <Text variant="metadata" color="grey-04">
                    Allocated
                  </Text>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        '-mb-px inline-flex items-center gap-1 border-b-2 py-2 text-metadataMedium',
        active ? 'border-text text-text' : 'border-transparent text-grey-04 hover:text-text'
      )}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-grey-02 px-1 text-footnote text-grey-04">{children}</span>;
}
