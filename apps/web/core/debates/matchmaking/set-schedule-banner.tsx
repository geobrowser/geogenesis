'use client';

import * as React from 'react';

import { useDebateSchedule, useGeoChatAuth, useSaveDebateSchedule } from '~/core/debates/hooks';
import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import { AvailabilityModal } from '~/partials/availability/availability-modal';

import { hubAnalyticsAttributes } from './hub-analytics';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`), like the explore
// welcome banner. Dismissing it is permanent, which is only safe because the calendar has a
// standing entry point of its own: "Set my schedule" in the profile menu
// (`partials/navbar/navbar-actions`). The availability toggle beside this banner is not a second
// one — that is "available to debate right now" on `PUT /me/debate-availability`, a different
// setting on a different endpoint.
const SET_SCHEDULE_BANNER_ID = 'debatesSetSchedule';

/**
 * "Set your debate schedule" — the callout at the top of the debates panel, above the tabs, whose
 * button opens the availability calendar (GEO-2936).
 *
 * Behind `ClientOnly` because the dismissed state only exists in the browser: server-rendering the
 * banner would flash it back up for everyone who has already closed it.
 */
export function SetScheduleBanner() {
  return (
    <ClientOnly>
      <Banner />
    </ClientOnly>
  );
}

function Banner() {
  const { authenticated } = useGeoChatAuth();
  const { dismissed, remember: handleDismiss } = useDismissedNotice(SET_SCHEDULE_BANNER_ID);
  const [modalOpen, setModalOpen] = React.useState(false);
  // Saved server-side now that the backend half of GEO-2936 exists (GEO-2932). `blocks` is
  // undefined until the first read answers; it is passed straight through, because the modal has
  // to tell "not read yet" from "an empty week" to avoid saving the latter over the former.
  const { blocks, isSet, isError, refetch } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule();
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  // A schedule is keyed to the Privy account, so signed out the read stays disabled and the
  // modal it opens has nothing to resolve to.
  if (!authenticated || dismissed) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg bg-[#EFE2FF] p-4">
      <div className="flex items-start justify-between gap-3">
        <Text as="h3" variant="smallTitle">
          {isSet ? 'Your debate schedule' : 'Set your debate schedule'}
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
        {isSet
          ? 'These are the times you’re free for debates. Update them whenever your week changes, so others can keep requesting a time that works for both of you.'
          : 'Set the times you’re free for debates. When you’re offline, others can check your availability and request a time that works for both of you.'}
      </Text>

      <button
        ref={openerRef}
        type="button"
        {...hubAnalyticsAttributes('Open schedule', 'open_debate_schedule')}
        onClick={() => setModalOpen(true)}
        className="mt-4 rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90"
      >
        {isSet ? 'Edit my schedule' : 'Set my schedule'}
      </button>

      <AvailabilityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        blocks={blocks}
        error={isError}
        onRetry={() => refetch()}
        onSave={nextBlocks => saveSchedule.mutate(nextBlocks)}
        openerRef={openerRef}
      />
    </div>
  );
}
