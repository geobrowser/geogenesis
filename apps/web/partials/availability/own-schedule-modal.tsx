'use client';

import type * as React from 'react';

import type { ScheduleEditorSurface } from '~/core/availability/schedule-analytics';
import { useDebateSchedule, useSaveDebateSchedule } from '~/core/debates/hooks';

import { AvailabilityModal } from './availability-modal';
import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';

/**
 * "Set your debate schedule", wired to the viewer's saved week — the one editor the navbar, the
 * debates hub's header calendar and banner, and your own availability link all open.
 */
export function OwnScheduleModal({
  open,
  onOpenChange,
  openerRef,
  onSaved,
  surface,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: React.RefObject<HTMLElement | null>;
  /** After Save hands the week off, before the dialog closes and returns focus to `openerRef`. */
  onSaved?: () => void;
  /** Which control opened it, for the saved event. */
  surface: ScheduleEditorSurface;
}) {
  // `blocks` stays undefined until the read answers, and is passed straight through: the modal has
  // to tell "not read yet" from "an empty week" to avoid saving the latter over the former.
  const { blocks, isError, refetch } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule({ surface });

  return (
    <AvailabilityModal
      open={open}
      onOpenChange={onOpenChange}
      blocks={blocks}
      error={isError}
      onRetry={() => refetch()}
      onSave={nextBlocks => {
        saveSchedule.mutate(nextBlocks);
        onSaved?.();
      }}
      openerRef={openerRef}
      headerAction={<CopyOwnAvailabilityLinkButton />}
    />
  );
}
