'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { GovernanceFilterMenu } from './governance-filter-menu';
import {
  GOVERNANCE_CATEGORY_LABELS,
  GOVERNANCE_STATUS_LABELS,
  type GovernanceProposalCategory,
  type GovernanceProposalStatusFilter,
  parseGovernanceCategory,
  parseGovernanceStatus,
} from './governance-proposal-query';

type Props = {
  spaceId: string;
  category: GovernanceProposalCategory;
  status: GovernanceProposalStatusFilter;
};

function buildSpaceGovernanceHref({
  spaceId,
  category,
  status,
  proposalId,
}: {
  spaceId: string;
  category: GovernanceProposalCategory;
  status: GovernanceProposalStatusFilter;
  proposalId?: string | null;
}) {
  const params = new URLSearchParams();
  if (category !== 'all') params.set('proposalCategory', category);
  if (status !== 'pending') params.set('proposalStatus', status);
  if (proposalId) params.set('proposalId', proposalId);
  const q = params.toString();
  return q ? `/space/${spaceId}/governance?${q}` : `/space/${spaceId}/governance`;
}

/** Category + status dropdowns matching governance home (space is implied by the route). */
export function GovernanceProposalFilters({ spaceId, category, status }: Props) {
  const searchParams = useSearchParams();
  const proposalId = searchParams?.get('proposalId');

  const filterState = { category, status };

  return (
    <div className="flex flex-wrap gap-2">
      <GovernanceFilterMenu
        label={GOVERNANCE_CATEGORY_LABELS[category]}
        items={(Object.keys(GOVERNANCE_CATEGORY_LABELS) as GovernanceProposalCategory[]).map(key => ({
          label: GOVERNANCE_CATEGORY_LABELS[key],
          href: buildSpaceGovernanceHref({ spaceId, ...filterState, category: key, proposalId }),
        }))}
      />
      <GovernanceFilterMenu
        label={GOVERNANCE_STATUS_LABELS[status]}
        items={(Object.keys(GOVERNANCE_STATUS_LABELS) as GovernanceProposalStatusFilter[]).map(key => ({
          label: GOVERNANCE_STATUS_LABELS[key],
          href: buildSpaceGovernanceHref({ spaceId, ...filterState, status: key, proposalId }),
        }))}
      />
    </div>
  );
}

export { parseGovernanceCategory, parseGovernanceStatus };
