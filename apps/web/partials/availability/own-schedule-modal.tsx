'use client';

import * as React from 'react';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import { calendarBusyWindow } from '~/core/availability/calendar-busy';
import type { ScheduleEditorSurface } from '~/core/availability/schedule-analytics';
import { useCalendarBusy, useCalendarConnections } from '~/core/debates/calendar-hooks';
import { useDebateSchedule, useSaveDebateSchedule } from '~/core/debates/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { AvailabilityModal } from './availability-modal';
import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';
import type { CalendarReturn } from './google-calendar-return-url';
import { GoogleCalendarSection } from './google-calendar-section';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: React.RefObject<HTMLElement | null>;
  /** After Save hands the week off, before the dialog closes and returns focus to `openerRef`. */
  onSaved?: (blocks: AvailabilityBlock[]) => void;
  /** Which control opened it, for the saved event. */
  surface: ScheduleEditorSurface;
  /** The outcome of connecting Google Calendar, when reopened on the way back. */
  calendarReturn?: CalendarReturn | null;
};

/**
 * "Set your debate schedule", wired to the viewer's saved week — the one editor the navbar, the
 * debates hub's header calendar and banner, and your own availability link all open.
 */
export function OwnScheduleModal(props: Props) {
  // A separate component, so the calendar reads are not even set up while the flag is off.
  return useFeatureFlag('googleCalendar') ? <ScheduleEditorWithCalendar {...props} /> : <ScheduleEditor {...props} />;
}

/** Google Calendar above the grid, and its busy time shaded on it. */
function ScheduleEditorWithCalendar(props: Props) {
  const { google, disabled } = useCalendarConnections(props.open);
  // Asked for only once there is a connection to have produced any.
  const busyRange = React.useMemo(
    () => (props.open && google ? calendarBusyWindow(new Date()) : null),
    [props.open, google]
  );
  const { intervals } = useCalendarBusy(busyRange);

  return (
    <ScheduleEditor
      {...props}
      calendarSection={
        disabled
          ? undefined
          : ({ unsavedChanges }) => (
              <GoogleCalendarSection unsavedChanges={unsavedChanges} returned={props.calendarReturn ?? null} />
            )
      }
      busyIntervals={busyRange ? intervals : undefined}
    />
  );
}

function ScheduleEditor({
  open,
  onOpenChange,
  openerRef,
  onSaved,
  surface,
  calendarSection,
  busyIntervals,
}: Props & Pick<React.ComponentProps<typeof AvailabilityModal>, 'calendarSection' | 'busyIntervals'>) {
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
        onSaved?.(nextBlocks);
      }}
      openerRef={openerRef}
      headerAction={<CopyOwnAvailabilityLinkButton />}
      calendarSection={calendarSection}
      busyIntervals={busyIntervals}
    />
  );
}
