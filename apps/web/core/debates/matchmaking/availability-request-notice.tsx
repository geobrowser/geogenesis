'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { AvailabilityModal } from '~/partials/availability/availability-modal';

import type { AvailabilityRequest } from '../api';
import { useDebateSchedule, useSaveDebateSchedule } from '../hooks';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { debateAnalyticsLabel } from './hub-analytics';
import { HubPillButton } from './hub-pill-button';
import { RequestSection } from './request-section';

/**
 * The admin's open requests for this person to add availability (GEO-3228). The server drops one
 * once they have saved availability since it was asked, or after 14 days, so there is nothing to
 * dismiss here: acting on it is what clears it.
 */
export function useAvailabilityRequests(): AvailabilityRequest[] {
  const { data } = useScheduledDebates();
  return data?.availability_requests ?? [];
}

function copyFor(request: AvailabilityRequest) {
  const who = request.requested_by_name?.trim() || 'The Geo team';
  return request.kind === 'more_times'
    ? {
        text: `${who} would like to set up a debate for you, but the times you have marked don’t overlap with anyone yet. Add a few more times.`,
        action: 'Add more times',
      }
    : {
        text: `${who} would like to set up a debate for you. Mark when you’re usually free and they can match you.`,
        action: 'Set availability',
      };
}

/** Opens the person's own week, the same editor the People tab's Set availability opens. */
export function AvailabilityRequestNotice({ requests }: { requests: AvailabilityRequest[] }) {
  const [open, setOpen] = React.useState(false);
  const { blocks, isError, refetch } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule({ surface: 'requests_tab' });
  const openerRef = React.useRef<HTMLElement | null>(null);

  // One notice however many admins asked: the newest says it.
  const latest = [...requests].sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
  if (!latest) return null;
  const { text, action } = copyFor(latest);

  return (
    <RequestSection label="Availability requested">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-grey-01 p-3">
        <Text as="p" variant="footnote">
          {text}
        </Text>
        <HubPillButton
          analyticsSurface="hub"
          analyticsLabel={debateAnalyticsLabel('hub', action)}
          analyticsIntent="open_debate_schedule"
          onClick={event => {
            openerRef.current = event.currentTarget;
            setOpen(true);
          }}
        >
          {action}
        </HubPillButton>
        <AvailabilityModal
          open={open}
          onOpenChange={setOpen}
          blocks={blocks}
          error={isError}
          onRetry={() => refetch()}
          onSave={nextBlocks => saveSchedule.mutate(nextBlocks)}
          openerRef={openerRef}
        />
      </div>
    </RequestSection>
  );
}
