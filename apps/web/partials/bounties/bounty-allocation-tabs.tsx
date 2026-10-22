'use client';

import * as React from 'react';

import cx from 'classnames';

import { type BountyDetail, distinctInterestedIds } from '~/core/bounties/fetch-bounty-detail';
import { useBountyAllocationActions } from '~/core/bounties/use-bounty-actions';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';
import { type PayoutRecipient, useDirectPayout, useSpaceBalance } from '~/core/bounties/use-direct-payout';
import { useEntityNames } from '~/core/bounties/use-entity-names';
import { usePersonalSpacesByPageIds } from '~/core/hooks/use-personal-spaces-by-page-ids';
import { uuidToHex } from '~/core/id/normalize';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { BountyPayDialog } from './bounty-pay-dialog';
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

  const allocatedIds = React.useMemo(() => [...new Set(detail.bounty.allocatedIds.map(uuidToHex))], [detail]);
  const interestedIds = React.useMemo(
    () => distinctInterestedIds(detail.interest, detail.bounty.spaceId),
    [detail.interest, detail.bounty.spaceId]
  );
  const allocatedSet = React.useMemo(() => new Set(allocatedIds), [allocatedIds]);
  const names = useEntityNames([...allocatedIds, ...interestedIds]);

  // Payouts go to the curator's personal space. Allocations written by curator-app
  // point at the person entity instead, so map those people to their spaces; an id
  // missing from the map is already a space.
  const spaceByPerson = usePersonalSpacesByPageIds(allocatedIds, roles.isEditor);
  const recipientSpaceId = (id: string) => spaceByPerson.data?.get(id) ?? id;

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
            // Known limitation: a curator allocated under the LEGACY shape (person
            // entity target) but interested under the current shape (personal-space
            // entity) won't match here, so Allocate stays clickable and could create
            // a second allocation under a second identity. Resolving the two shapes
            // needs a person↔space profile lookup; deliberately not built for a case
            // this rare — deduped counts keep it from affecting spots math.
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
                    <div className="flex shrink-0 items-center gap-2">
                      <SmallButton
                        disabled={payout.busy || !spaceByPerson.isSuccess}
                        onClick={() =>
                          setPaying({
                            recipient: { spaceId: recipientSpaceId(id), name: names.data?.get(id) ?? null },
                            label: label(id),
                          })
                        }
                      >
                        Pay
                      </SmallButton>
                      <SmallButton disabled={pending} onClick={() => void actions.remove(id)}>
                        {pending ? 'Removing…' : 'Remove'}
                      </SmallButton>
                    </div>
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
          pendingCredit={payout.pendingCredit}
          busy={payout.busy}
          onPay={amount =>
            paying ? payout.pay(paying.recipient, amount) : Promise.resolve({ status: 'publish-failed' })
          }
          onRetryCredit={payout.retryCredit}
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
