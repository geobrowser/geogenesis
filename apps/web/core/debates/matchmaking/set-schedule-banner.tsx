'use client';

import * as React from 'react';

import { useDebateSchedule, useGeoChatAuth } from '~/core/debates/hooks';
import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import { OwnScheduleModal } from '~/partials/availability/own-schedule-modal';

import { hubAnalyticsAttributes } from './hub-analytics';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`), like the explore
// welcome banner. Dismissing it is permanent, which is safe because the calendar has a standing
// entry point right above it: the calendar button in the hub header (`./schedule-button`), which
// keeps a dot on it until a schedule is saved. The availability toggle beside that button is a
// different setting — "available to debate right now" on `PUT /me/debate-availability`.
const SET_SCHEDULE_BANNER_ID = 'debatesSetSchedule';

/**
 * "Set your debate schedule" — the callout at the top of the debates panel, above the tabs, whose
 * button opens the availability calendar (GEO-2936).
 *
 * Onboarding only: once a schedule is saved it retires for good, because the header's calendar
 * button is where the schedule lives from then on, and a full-width card restating it on every
 * tab costs the lists below their room.
 *
 * Behind `ClientOnly` because the dismissed state only exists in the browser: server-rendering the
 * banner would flash it back up for everyone who has already closed it.
 */
type Props = {
  /**
   * The header's calendar button. Both ways the banner leaves — dismissed, or retired by a save —
   * take the focused control with it, so focus moves up here rather than dropping to the page.
   */
  scheduleButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

export function SetScheduleBanner(props: Props) {
  return (
    <ClientOnly>
      <Banner {...props} />
    </ClientOnly>
  );
}

function Banner({ scheduleButtonRef }: Props) {
  const { authenticated } = useGeoChatAuth();
  const { dismissed, remember } = useDismissedNotice(SET_SCHEDULE_BANNER_ID);
  const [modalOpen, setModalOpen] = React.useState(false);
  // Saved server-side now that the backend half of GEO-2936 exists (GEO-2932). Only whether one is
  // set is read here; the modal reads and saves the week itself.
  const { data, isSet } = useDebateSchedule();
  const openerRef = React.useRef<HTMLButtonElement | null>(null);
  // Where the dialog returns focus on close. The banner's own button, unless the dialog saved: the
  // save retires the banner moments later, and focus parked on its button would go with it.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const handleDismiss = () => {
    scheduleButtonRef?.current?.focus();
    remember();
  };

  // A schedule is keyed to the Privy account, so signed out the read stays disabled and the
  // modal it opens has nothing to resolve to.
  if (!authenticated || dismissed) return null;
  // Waits for the read rather than defaulting to "unset": everyone who already has a schedule
  // would otherwise watch the banner appear and vanish each time the panel opens.
  if (data === undefined || isSet) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg bg-[#EFE2FF] p-4">
      <div className="flex items-start justify-between gap-3">
        <Text as="h3" variant="smallTitle">
          Set your debate schedule
        </Text>
        <button
          type="button"
          aria-label="Dismiss"
          {...hubAnalyticsAttributes('Dismiss schedule prompt', 'dismiss_debate_schedule_prompt')}
          onClick={handleDismiss}
          className="shrink-0 text-grey-04 transition-colors hover:text-text"
        >
          <CloseSmall />
        </button>
      </div>

      <Text as="p" variant="metadata" className="mt-2">
        Set the times you’re free for debates. When you’re offline, others can check your availability and request a
        time that works for both of you. You can change it any time from the calendar above.
      </Text>

      <button
        ref={openerRef}
        type="button"
        {...hubAnalyticsAttributes('Open schedule', 'open_debate_schedule')}
        onClick={() => {
          returnFocusRef.current = openerRef.current;
          setModalOpen(true);
        }}
        className="mt-4 rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90"
      >
        Set my schedule
      </button>

      <OwnScheduleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        openerRef={returnFocusRef}
        onSaved={() => {
          if (scheduleButtonRef?.current) returnFocusRef.current = scheduleButtonRef.current;
        }}
      />
    </div>
  );
}
