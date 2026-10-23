'use client';

import * as React from 'react';

import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { hasUpcomingAvailability } from '~/core/availability/upcoming-availability';
import { useDebateSchedule, useGeoChatAuth } from '~/core/debates/hooks';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

import { OwnScheduleModal } from '~/partials/availability/own-schedule-modal';

import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { HubPillButton } from './hub-pill-button';

/**
 * Dismissed for good on this device. The nudge is a one-time suggestion, not a standing state: once
 * the viewer has said no, asking again on the next visit is the banner it replaced.
 */
const noTimesNudgeDismissedAtom = atomWithStorage('debatesHubNoTimesNudgeDismissed', false);

/**
 * "You have no times set", as one dismissable line under the panel's list (GEO-3463).
 *
 * It replaces the "Debate schedule" banner that sat above every tab, which took a third of the panel
 * before anything the viewer opened it for. The ask is the same — add times so people can invite you
 * while you're offline — but it is one line, outside the tabs so it is not repeated per tab, and it
 * goes away for good when dismissed.
 */
export function NoTimesNudge() {
  return (
    <ClientOnly>
      <Nudge />
    </ClientOnly>
  );
}

function Nudge() {
  const { authenticated } = useGeoChatAuth();
  const { data, blocks } = useDebateSchedule();
  const [dismissed, setDismissed] = useAtom(noTimesNudgeDismissedAtom);
  const [editing, setEditing] = React.useState(false);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  const hasTimes = data !== undefined && hasUpcomingAvailability(blocks, data.schedule.timezone);
  // The modal outlives the line: saving times hides the line, and the modal must not go with it.
  const showLine = authenticated && data !== undefined && !hasTimes && !dismissed;

  if (!showLine && !editing) return null;

  return (
    <>
      {showLine ? (
        <div
          data-testid="no-times-nudge"
          className="flex shrink-0 items-center gap-2.5 border-t border-grey-02 bg-[#EFE2FF] py-2 pr-2 pl-4"
        >
          <p className="min-w-0 flex-1 text-breadcrumb text-text">
            <span className="font-medium">You have no times set.</span> Add some so people can invite you when you’re
            offline.
          </p>
          <HubPillButton
            ref={openerRef}
            variant="primary"
            analyticsLabel={debateAnalyticsLabel('hub', 'Open schedule')}
            analyticsIntent="open_debate_schedule"
            onClick={() => setEditing(true)}
          >
            Set my times
          </HubPillButton>
          <button
            type="button"
            aria-label="Hide"
            {...hubAnalyticsAttributes('Dismiss no times nudge')}
            onClick={() => setDismissed(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grey-04 hover:bg-white/60"
          >
            <CloseSmall />
          </button>
        </div>
      ) : null}
      <OwnScheduleModal open={editing} onOpenChange={setEditing} openerRef={openerRef} surface="hub_banner" />
    </>
  );
}
