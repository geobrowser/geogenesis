'use client';

import { useRouter } from 'next/navigation';

import * as React from 'react';

import { SlideUp } from '~/design-system/slide-up';

interface Props {
  proposalId?: string;
  spaceId: string;
  children: React.ReactNode;
}

export function ActiveProposalSlideUp({ proposalId, spaceId, children }: Props) {
  const router = useRouter();

  return (
    <SlideUp
      isOpen={Boolean(proposalId)}
      setIsOpen={open => {
        if (!open) {
          router.push(`/space/${spaceId}/governance`);
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
    </SlideUp>
  );
}
