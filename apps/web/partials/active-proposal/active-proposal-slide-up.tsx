'use client';

import { useRouter } from 'next/navigation';

import * as React from 'react';

import { SlideUp } from '~/design-system/slide-up';

interface Props {
  proposalId?: string;
  children: React.ReactNode;
}

export function ActiveProposalSlideUp({ proposalId, children }: Props) {
  const router = useRouter();

  return (
    <SlideUp
      isOpen={Boolean(proposalId)}
      setIsOpen={open => {
        if (!open) {
          router.back();
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
    </SlideUp>
  );
}
