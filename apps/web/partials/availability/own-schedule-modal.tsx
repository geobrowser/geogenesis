'use client';

import * as React from 'react';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import { calendarBusyWindow } from '~/core/availability/calendar-busy';
import type { ScheduleEditorSurface } from '~/core/availability/schedule-analytics';
import type { CalendarProvider } from '~/core/debates/api';
import { useCalendarBusy, useCalendarConnections } from '~/core/debates/calendar-hooks';
import { useDebateSchedule, useSaveDebateSchedule } from '~/core/debates/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { AvailabilityModal } from './availability-modal';
import type { CalendarReturn } from './calendar-return-url';
import { CalendarSection } from './calendar-section';
import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: React.RefObject<HTMLElement | null>;
  /** After Save hands the week off, before the dialog closes and returns focus to `openerRef`. */
  onSaved?: (blocks: AvailabilityBlock[]) => void;
  /** Which control opened it, for the saved event. */
  surface: ScheduleEditorSurface;
  /** The outcome of connecting a calendar, when reopened on the way back. */
  calendarReturn?: CalendarReturn | null;
};

/**
 * "Set your debate schedule", wired to the viewer's saved week — the one editor the navbar, the
 * debates hub's header calendar and banner, and your own availability link all open.
 */
export function OwnScheduleModal(props: Props) {
  const google = useFeatureFlag('googleCalendar');
  const microsoft = useFeatureFlag('microsoftCalendar');
  const providers: CalendarProvider[] = [
    ...(google ? ['google' as const] : []),
    ...(microsoft ? ['microsoft' as const] : []),
  ];

  // A separate component, so the calendar reads are not even set up while both flags are off.
  return providers.length > 0 ? (
    <ScheduleEditorWithCalendar {...props} providers={providers} />
  ) : (
    <ScheduleEditor {...props} />
  );
}

/** Connected calendars above the grid, and their merged busy time shaded on it. */
function ScheduleEditorWithCalendar({ providers, ...props }: Props & { providers: CalendarProvider[] }) {
  const { google, microsoft, disabled } = useCalendarConnections(props.open);
  // Asked for only once there is a connection to have produced any. Busy time is merged server-side.
  const connected = Boolean(google || microsoft);
  const busyRange = React.useMemo(
    () => (props.open && connected ? calendarBusyWindow(new Date()) : null),
    [props.open, connected]
  );
  const { intervals } = useCalendarBusy(busyRange);

  return (
    <ScheduleEditor
      {...props}
      calendarSection={
        disabled
          ? undefined
          : ({ unsavedChanges }) => (
              <CalendarSection
                providers={providers}
                unsavedChanges={unsavedChanges}
                returned={props.calendarReturn ?? null}
              />
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
