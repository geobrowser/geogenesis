'use client';

import type * as React from 'react';

import { useDebateSchedule, useSaveDebateSchedule } from '~/core/debates/hooks';

import { AvailabilityModal } from './availability-modal';
import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';

/**
 * "Set your debate schedule", wired to the viewer's saved week — the one editor the navbar, the
 * debates hub banner and your own availability link all open.
 */
export function OwnScheduleModal({
  open,
  onOpenChange,
  openerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: React.RefObject<HTMLElement | null>;
}) {
  // `blocks` stays undefined until the read answers, and is passed straight through: the modal has
  // to tell "not read yet" from "an empty week" to avoid saving the latter over the former.
  const { blocks, isError, refetch } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule();

  return (
    <AvailabilityModal
      open={open}
      onOpenChange={onOpenChange}
      blocks={blocks}
      error={isError}
      onRetry={() => refetch()}
      onSave={nextBlocks => saveSchedule.mutate(nextBlocks)}
      openerRef={openerRef}
      headerAction={<CopyOwnAvailabilityLinkButton />}
    />
  );
}
