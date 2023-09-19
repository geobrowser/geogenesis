'use client';

import Image from 'next/legacy/image';

import { getImagePath } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';

import { useGovernanceProposal } from './governance-view-proposal';

interface Props {
  spaceName: string | null;
  spaceImage: string | null;
}

export function GovernanceViewProposalContentHeader({ spaceName, spaceImage }: Props) {
  const { setIsOpen } = useGovernanceProposal();

  return (
    <div className="flex w-full items-center gap-3 bg-white px-4 py-2.5 text-button shadow-big">
      <SquareButton icon="close" onClick={() => setIsOpen(false)} />
      <h2 className="flex items-center">
        <span>Review proposal in</span>
        {spaceImage && (
          <div className="relative mx-2 h-4 w-4 overflow-hidden rounded-sm">
            <Image src={getImagePath(spaceImage)} layout="fill" objectFit="cover" />
          </div>
        )}
        <span>{spaceName}</span>
      </h2>
    </div>
  );
}
