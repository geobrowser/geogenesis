'use client';

import { useSearchParams } from 'next/navigation';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

export type GovernanceProposalType = 'all' | 'proposals' | 'requests';

const filterLabels: Record<GovernanceProposalType, string> = {
  all: 'All',
  proposals: 'Active Proposals',
  requests: 'Membership Requests',
};

interface Props {
  spaceId: string;
}

export function GovernanceProposalTypeFilter({ spaceId }: Props) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const params = useSearchParams();
  const proposalType = params?.get('proposalType') as GovernanceProposalType | null;
  const activeFilter: GovernanceProposalType =
    proposalType && proposalType in filterLabels ? proposalType : 'proposals';
  const label = filterLabels[activeFilter];

  const baseHref = `/space/${spaceId}/governance`;

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      asChild
      trigger={<SmallButton icon={<ChevronDownSmall />}>{label}</SmallButton>}
      align="start"
      sideOffset={-8} // not sure why, but this is necessary for proper gap spacing
    >
      <Link
        href={`${baseHref}?proposalType=all`}
        onClick={() => setIsMenuOpen(false)}
        className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
      >
        <Text variant="button" className="hover:!text-text">
          All
        </Text>
      </Link>
      <Link
        href={baseHref}
        onClick={() => setIsMenuOpen(false)}
        className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
      >
        <Text variant="button" className="hover:!text-text">
          Active proposals
        </Text>
      </Link>
      <Link
        href={`${baseHref}?proposalType=requests`}
        onClick={() => setIsMenuOpen(false)}
        className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
      >
        <Text variant="button" className="hover:!text-text">
          Membership requests
        </Text>
      </Link>
    </Menu>
  );
}
