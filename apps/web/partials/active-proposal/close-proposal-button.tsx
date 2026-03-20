'use client';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

import { useCloseProposal } from './use-close-proposal';

type CloseProposalButtonProps = {
  spaceId: string;
};

export function CloseProposalButton({ spaceId }: CloseProposalButtonProps) {
  const closeProposal = useCloseProposal(spaceId);

  return <SquareButton icon={<Close />} onClick={closeProposal} />;
}
