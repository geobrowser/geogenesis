'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Button, SquareButton } from '~/design-system/button';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';
import { Time } from '~/design-system/icons/time';
import { SlideUp } from '~/design-system/slide-up';

interface Props {
  proposalId?: string;
  spaceId: string;
  reviewComponent?: React.ReactNode;
}

export const ActiveProposal = ({ proposalId, spaceId }: Props) => {
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
      <div className="h-full overflow-y-auto overscroll-contain">
        <React.Suspense fallback="Loading...">
          <ReviewActiveProposal proposalId={proposalId} spaceId={spaceId} />
        </React.Suspense>
      </div>
    </SlideUp>
  );
};

async function ReviewActiveProposal({ proposalId, spaceId }: Props) {
  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 text-button text-text shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <Link href={`/space/${spaceId}/governance`}>
            <SquareButton icon={<Close />} />
          </Link>
          <p>Review proposal</p>
        </div>
        <div className="inline-flex items-center gap-4">
          <Button variant="error">Reject</Button>
          <span>or</span>
          <Button variant="success">Accept</Button>
        </div>
      </div>
      <div className="my-3 bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] py-10 xl:pl-[2ch] xl:pr-[2ch]">
          <div className="flex flex-col gap-4">
            <div className="text-mediumTitle">Changes to x, y, and z across several pages</div>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-breadcrumb text-grey-04">
                <span>495 edits</span>
                <span>·</span>
                <span>12 entities</span>
                <span>·</span>
                <Link href={''} className="flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
                  <div className="relative h-3 w-3 overflow-hidden rounded-full">
                    <Avatar avatarUrl={''} value={''} />
                  </div>
                  <p>Anonymous</p>
                </Link>
              </div>
              <div className="inline-flex gap-2">
                <div className="inline-flex items-center gap-1.5 rounded bg-grey-02 px-2 py-1 text-breadcrumb text-grey-04">
                  <BulkEdit />
                  <span>4/12 editors have voted</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded bg-grey-02 px-2 py-1 text-breadcrumb text-grey-04">
                  <Time />
                  <span>23h 58m remaining</span>
                </div>
              </div>
            </div>
            <div className="flex w-full gap-8">
              <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                  <Tick />
                </div>
                <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                  <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: '75%' }} />
                </div>
                <div>75%</div>
              </div>
              <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                  <Close />
                </div>
                <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                  <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: '25%' }} />
                </div>
                <div>25%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-t-4 mt-3 h-full overflow-y-auto overscroll-contain bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          <Proposal />
        </div>
      </div>
    </>
  );
}

const Proposal = () => {
  // @TODO add markup + logic from <Proposals /> in partials/history/compare.tsx

  return (
    <div>
      <div>Reviewing proposal</div>
    </div>
  );
};
