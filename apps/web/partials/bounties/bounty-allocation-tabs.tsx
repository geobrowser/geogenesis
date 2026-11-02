'use client';

import * as React from 'react';

import cx from 'classnames';

import { type BountyDetail, distinctInterestedIds } from '~/core/bounties/fetch-bounty-detail';
import { useBountyAllocationActions } from '~/core/bounties/use-bounty-actions';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';
import { useCuratorSpaces } from '~/core/bounties/use-curator-spaces';
import { type PayoutRecipient, useDirectPayout, useSpaceBalance } from '~/core/bounties/use-direct-payout';
import { useEntityNames } from '~/core/bounties/use-entity-names';
import { uuidToHex } from '~/core/id/normalize';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { BountyPayDialog, describePendingPayout } from './bounty-pay-dialog';
import { CuratorSearch } from './curator-search';

type Props = {
  detail: BountyDetail;
  roles: BountyRoles;
};

type Tab = 'allocated' | 'interested';

/**
 * Allocated / Interested curators. Editors allocate (from interest, or anyone
 * by name), remove, and pay an allocated curator directly — no submission
 * needed, for bounties worked in the curators' own spaces.
 */
export function BountyAllocationTabs({ detail, roles }: Props) {
  const [tab, setTab] = React.useState<Tab>('allocated');
  const actions = useBountyAllocationActions(detail);
  const payout = useDirectPayout(detail);
  const [paying, setPaying] = React.useState<{ recipient: PayoutRecipient; label: string } | null>(null);
  const balance = useSpaceBalance(detail.bounty.spaceId, roles.isEditor);

  const rawAllocatedIds = React.useMemo(() => [...new Set(detail.bounty.allocatedIds.map(uuidToHex))], [detail]);
  const rawInterestedIds = React.useMemo(
    () => distinctInterestedIds(detail.interest, detail.bounty.spaceId),
    [detail.interest, detail.bounty.spaceId]
  );

  // One curator can be allocated under their person entity (curator-app's shape) and
  // show interest from their personal space (Geo's), so every id is folded onto the
  // personal space it belongs to. Without this the same curator shows as unallocated
  // with an Allocate button, and a second allocation gives them two rows and two Pay
  // buttons. An id with no personal space keeps its own row but is marked, so it is
  // never paid or allocated as if it were one.
  const curatorSpaces = useCuratorSpaces(
    React.useMemo(() => [...rawAllocatedIds, ...rawInterestedIds], [rawAllocatedIds, rawInterestedIds])
  );
  const { spaceOf, isResolved: spacesResolved } = curatorSpaces;
  const { allocatedIds, targetsBySpace, interestedIds, withoutSpace } = React.useMemo(() => {
    const unresolved = new Set<string>();
    const toKey = (id: string) => {
      const space = spaceOf(id);
      if (space) return space;
      if (spacesResolved) unresolved.add(id);
      return id;
    };
    const targets = new Map<string, string[]>();
    for (const id of rawAllocatedIds) targets.set(toKey(id), [...(targets.get(toKey(id)) ?? []), id]);
    return {
      allocatedIds: [...targets.keys()],
      targetsBySpace: targets,
      interestedIds: [...new Set(rawInterestedIds.map(toKey))],
      withoutSpace: unresolved,
    };
  }, [rawAllocatedIds, rawInterestedIds, spaceOf, spacesResolved]);
  const allocatedSet = React.useMemo(() => new Set(allocatedIds), [allocatedIds]);
  const names = useEntityNames([...allocatedIds, ...interestedIds, ...rawAllocatedIds]);

  const spotsLeft =
    detail.bounty.maxContributors != null ? Math.max(0, detail.bounty.maxContributors - allocatedIds.length) : null;

  const rows = tab === 'allocated' ? allocatedIds : interestedIds;
  const nameOf = (id: string): string | null =>
    [id, ...(targetsBySpace.get(id) ?? [])].map(key => names.data?.get(key)?.trim()).find(Boolean) ?? null;
  const label = (id: string): string => nameOf(id) ?? `${id.slice(0, 6)}…${id.slice(-4)}`;

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

      {roles.isEditor && payout.pendingPayout ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border border-grey-02 px-3 py-2"
          data-testid="pending-payout-notice"
        >
          <Text variant="metadata">{describePendingPayout(payout.pendingPayout)}</Text>
          <SmallButton
            disabled={payout.busy}
            onClick={() => {
              const { recipient } = payout.pendingPayout!;
              setPaying({ recipient, label: recipient.name ?? label(recipient.spaceId) });
            }}
          >
            Finish payout
          </SmallButton>
        </div>
      ) : null}

      {roles.isEditor && tab === 'allocated' && spotsLeft !== 0 ? (
        <div data-testid="allocate-search">
          <CuratorSearch
            placeholder="Allocate a curator by name…"
            allocatedIds={allocatedSet}
            onSelect={curator => void actions.allocate({ spaceId: curator.spaceId, name: curator.name })}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Text variant="metadata" color="grey-04">
          {tab === 'allocated' ? 'No curators allocated yet.' : 'No one has expressed interest yet.'}
        </Text>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-02">
          {rows.map(id => {
            const isAllocated = allocatedSet.has(id);
            const pending = actions.pendingTargetId != null && uuidToHex(actions.pendingTargetId) === id;
            const targetIds = targetsBySpace.get(id) ?? [id];
            // Pay and Allocate need to know the curator's personal space, and that one exists.
            const actionable = spacesResolved && !withoutSpace.has(id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 py-2" data-testid="curator-row">
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={NavUtils.toEntity(detail.bounty.spaceId, id)}
                    className="min-w-0 truncate text-metadata hover:underline"
                  >
                    {label(id)}
                  </Link>
                  {roles.isEditor && withoutSpace.has(id) ? (
                    <Text variant="footnote" color="grey-04">
                      No personal space, so they can&apos;t be paid or allocated here.
                    </Text>
                  ) : null}
                </div>
                {roles.isEditor ? (
                  tab === 'allocated' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <SmallButton
                        disabled={payout.busy || !actionable}
                        onClick={() =>
                          setPaying({
                            recipient: { spaceId: id, name: nameOf(id) },
                            label: label(id),
                          })
                        }
                      >
                        Pay
                      </SmallButton>
                      <SmallButton disabled={pending} onClick={() => void actions.remove({ id, targetIds })}>
                        {pending ? 'Removing…' : 'Remove'}
                      </SmallButton>
                    </div>
                  ) : isAllocated ? (
                    <Text variant="metadata" color="grey-04">
                      Allocated
                    </Text>
                  ) : (
                    <SmallButton
                      disabled={pending || spotsLeft === 0 || !actionable}
                      onClick={() => void actions.allocate({ spaceId: id, name: nameOf(id) })}
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

      {roles.isEditor ? (
        <BountyPayDialog
          open={paying !== null}
          onOpenChange={open => {
            if (!open) setPaying(null);
          }}
          bountyName={detail.bounty.name}
          recipient={paying?.recipient ?? null}
          recipientLabel={paying?.label ?? 'curator'}
          balance={balance.data ?? null}
          balanceLoading={balance.isLoading}
          pendingPayout={payout.pendingPayout}
          busy={payout.busy}
          onPay={amount =>
            paying
              ? payout.pay(paying.recipient, amount)
              : Promise.resolve({ status: 'not-paid', message: 'No curator selected.' })
          }
          onFinish={payout.finish}
        />
      ) : null}
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
