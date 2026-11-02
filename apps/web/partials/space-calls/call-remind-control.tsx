'use client';

import * as React from 'react';

import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import type { ReminderScope } from '~/core/space-calls/series/call-remind-press';

import { Menu, MenuItem } from '~/design-system/menu';

export const CALL_REMIND_COPY = {
  remind: 'Remind me',
  reminded: 'Reminding you',
  remindedSeries: 'Reminding you · every call',
  thisCall: 'This call',
  everyCall: 'Every call in this series',
} as const;

export function remindLabel(reminded: { call: boolean; series: boolean }) {
  if (reminded.series) return CALL_REMIND_COPY.remindedSeries;
  return reminded.call ? CALL_REMIND_COPY.reminded : CALL_REMIND_COPY.remind;
}

/**
 * Remind me on a scheduled call (GEO-3420). A one-off toggles on a press. A call in a series offers
 * both reminders, set independently: this call, and every call in the series.
 */
export function CallRemindControl({
  reminded,
  hasSeries,
  pending,
  onToggle,
  analyticsLabel = 'Call remind',
}: {
  reminded: { call: boolean; series: boolean };
  hasSeries: boolean;
  pending: boolean;
  onToggle: (scope: ReminderScope, remind: boolean) => void;
  analyticsLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const label = remindLabel(reminded);
  const any = reminded.call || reminded.series;

  if (!hasSeries) {
    return (
      <HubPillButton
        variant={reminded.call ? 'primary' : 'secondary'}
        analyticsLabel={`${analyticsLabel} ${reminded.call ? 'off' : 'on'}`}
        aria-pressed={reminded.call}
        pending={pending}
        onClick={() => onToggle('call', !reminded.call)}
      >
        {label}
      </HubPillButton>
    );
  }

  const choose = (scope: ReminderScope) => {
    setOpen(false);
    onToggle(scope, !reminded[scope]);
  };

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      align="end"
      className="max-w-[260px]"
      trigger={
        <HubPillButton
          variant={any ? 'primary' : 'secondary'}
          analyticsLabel={`${analyticsLabel} menu`}
          pending={pending}
        >
          {label}
        </HubPillButton>
      }
    >
      <ReminderChoice active={reminded.call} onClick={() => choose('call')}>
        {CALL_REMIND_COPY.thisCall}
      </ReminderChoice>
      <ReminderChoice active={reminded.series} onClick={() => choose('series')}>
        {CALL_REMIND_COPY.everyCall}
      </ReminderChoice>
    </Menu>
  );
}

function ReminderChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <MenuItem active={active} onClick={onClick}>
      <span className="flex w-full items-center justify-between gap-3">
        {children}
        {active ? (
          <>
            <span aria-hidden>✓</span>
            <span className="sr-only">(on)</span>
          </>
        ) : null}
      </span>
    </MenuItem>
  );
}
