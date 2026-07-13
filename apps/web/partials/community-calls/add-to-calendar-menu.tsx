'use client';

import * as React from 'react';

import {
  buildCallJoinUrl,
  buildGoogleCalendarHref,
  buildOutlookCalendarHref,
  buildWebcalHref,
} from '~/core/community-calls/format';
import { extractRawRRule, parseSchedule } from '~/core/utils/schedule';

import { Dropdown } from '~/design-system/dropdown';

type Props = {
  spaceId: string;
  callId: string;
  name: string;
  startMs: number;
  endMs: number;
  /** Raw series schedule string — its RRULE (if any) is passed through to Google Calendar
   *  so the created event repeats instead of covering just this one occurrence. */
  schedule?: string;
};

/** Windows and Android calendar apps don't handle `webcal://` links, so curator hides
 *  the subscribe option on those platforms (`os-detection.ts`'s `getOS`). */
function isWindowsOrAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform?.toLowerCase();
  if (platform) return platform === 'windows' || platform === 'android';
  return navigator.userAgent.includes('Windows') || navigator.userAgent.includes('Android');
}

/**
 * "Add to calendar" dropdown — webcal subscribe (this series' own recurring feed,
 * hidden on Windows/Android), Add to Google/Outlook (single-occurrence deep links).
 * Shared across the Community tab, explore side-panel digest, and the space Overview
 * digest so all three surfaces offer the same calendar parity.
 */
export function AddToCalendarMenu({ spaceId, callId, name, startMs, endMs, schedule }: Props) {
  const rrule = schedule ? extractRawRRule(schedule) : undefined;
  const timezone = schedule ? parseSchedule(schedule).timezone : undefined;

  // Default to showing webcal so server/first-client render match (no `navigator` on
  // the server); refine after mount once we can actually check the platform.
  const [showWebcal, setShowWebcal] = React.useState(true);
  React.useEffect(() => {
    setShowWebcal(!isWindowsOrAndroid());
  }, []);

  return (
    <Dropdown
      trigger={<span>Add to calendar</span>}
      align="end"
      options={[
        ...(showWebcal
          ? [
              {
                label: 'Subscribe (webcal)',
                value: 'webcal',
                disabled: false,
                onClick: () => {
                  window.location.href = buildWebcalHref({ origin: window.location.origin, spaceId, callId });
                },
              },
            ]
          : []),
        {
          label: 'Add to Google Calendar',
          value: 'google',
          disabled: false,
          onClick: () => {
            const joinUrl = buildCallJoinUrl({ origin: window.location.origin, spaceId, callId });
            window.open(
              buildGoogleCalendarHref({ name, startMs, endMs, joinUrl, rrule, timezone }),
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
            const joinUrl = buildCallJoinUrl({ origin: window.location.origin, spaceId, callId });
            window.open(buildOutlookCalendarHref({ name, startMs, endMs, joinUrl }), '_blank', 'noopener,noreferrer');
          },
        },
      ]}
    />
  );
}
