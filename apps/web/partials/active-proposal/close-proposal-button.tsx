'use client';

import { useRouter } from 'next/navigation';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

export function CloseProposalButton() {
  const router = useRouter();

  return <SquareButton icon={<Close />} onClick={() => router.back()} />;
}
