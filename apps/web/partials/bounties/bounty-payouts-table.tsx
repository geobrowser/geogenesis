'use client';

import * as React from 'react';

import type { PayoutItem } from '~/core/bounties/group-submissions';
import { formatPoints } from '~/core/bounties/payout';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

type Props = {
  spaceId: string;
  payouts: PayoutItem[];
};

export function BountyPayoutsTable({ spaceId, payouts }: Props) {
  const total = payouts.reduce((sum, payout) => sum + payout.amount, 0);
  return (
    <section aria-label="Payouts" data-testid="bounty-payouts" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <Text as="h2" variant="smallTitle">
          Payouts
        </Text>
        {payouts.length > 0 ? (
          <Text variant="metadata" color="grey-04">
            {formatPoints(total)} points paid across {payouts.length} payout{payouts.length === 1 ? '' : 's'}
          </Text>
        ) : null}
      </div>
      {payouts.length === 0 ? (
        <Text variant="metadata" color="grey-04">
          No payouts yet.
        </Text>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-grey-02">
          <table className="w-full min-w-[520px] text-metadata">
            <thead className="bg-bg text-left text-grey-04">
              <tr>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Proposals</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-02">
              {payouts.map(payout => (
                <tr key={payout.id} data-testid="payout-row">
                  <td className="px-3 py-2">
                    <Link href={NavUtils.toEntity(spaceId, payout.recipientEntityId)} className="hover:underline">
                      {payout.recipientName ?? `${payout.recipientEntityId.slice(0, 6)}…`}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatPoints(payout.amount)}</td>
                  <td className="px-3 py-2 text-grey-04">{payout.proposalIds.length}</td>
                  <td className="px-3 py-2 text-grey-04">{payout.createdAt.toLocaleDateString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
