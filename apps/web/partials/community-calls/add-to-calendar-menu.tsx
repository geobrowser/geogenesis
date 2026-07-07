'use client';

import * as React from 'react';

import {
  buildGoogleCalendarHref,
  buildIcsHref,
  buildOutlookCalendarHref,
  buildWebcalHref,
} from '~/core/community-calls/format';
import { extractRawRRule } from '~/core/utils/schedule';

import { Dropdown } from '~/design-system/dropdown';

type Props = {
  spaceId: string;
  callId: string;
  name: string;
  description: string | null;
  startMs: number;
  endMs: number;
  /** Raw series schedule string — its RRULE (if any) is passed through to Google Calendar
   *  so the created event repeats instead of covering just this one occurrence. */
  schedule?: string;
};

/**
 * "Add to calendar" dropdown — webcal subscribe (this series' own recurring feed),
 * Add to Google/Outlook (single-occurrence deep links), and the original one-shot
 * `.ics` download. Shared across the Community tab, explore side-panel digest, and
 * the space Overview digest so all three surfaces offer the same calendar parity.
 */
export function AddToCalendarMenu({ spaceId, callId, name, description, startMs, endMs, schedule }: Props) {
  const rrule = schedule ? extractRawRRule(schedule) : undefined;

  return (
    <Dropdown
      trigger={<span>Add to calendar</span>}
      align="end"
      options={[
        {
          label: 'Subscribe (webcal)',
          value: 'webcal',
          disabled: false,
          onClick: () => {
            window.location.href = buildWebcalHref({ origin: window.location.origin, spaceId, callId });
          },
        },
        {
          label: 'Add to Google Calendar',
          value: 'google',
          disabled: false,
          onClick: () => {
            window.open(
              buildGoogleCalendarHref({ name, description, startMs, endMs, rrule }),
              '_blank',
              'noopener,noreferrer'
            );
          },
        },
        {
          label: 'Add to Outlook',
          value: 'outlook',
          disabled: false,
          onClick: () => {
            window.open(
              buildOutlookCalendarHref({ name, description, startMs, endMs }),
              '_blank',
              'noopener,noreferrer'
            );
          },
        },
        {
          label: 'Download .ics',
          value: 'ics',
          disabled: false,
          onClick: () => {
            const a = document.createElement('a');
            a.href = buildIcsHref({ callId, name, description, startMs, endMs });
            a.download = `${name}.ics`;
            a.click();
          },
        },
      ]}
    />
  );
}
