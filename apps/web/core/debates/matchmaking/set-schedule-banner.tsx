'use client';

import * as React from 'react';

import { useDebateSchedule, useSaveDebateSchedule } from '~/core/debates/hooks';
import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

import { AvailabilityModal } from '~/partials/availability/availability-modal';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`), like the explore
// welcome banner. Dismissing it is permanent — the schedule stays reachable from the availability
// toggle beside it, so nothing is lost with the banner.
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
  const { dismissed, remember: handleDismiss } = useDismissedNotice(SET_SCHEDULE_BANNER_ID);
  const [modalOpen, setModalOpen] = React.useState(false);
  // Saved server-side now that the backend half of GEO-2936 exists (GEO-2932). `blocks` is
  // undefined until the first read answers, which the modal treats as an empty calendar — the
  // same thing it showed before, so opening it early is no worse than it was.
  const { blocks } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule();
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  if (dismissed) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg bg-[#EFE2FF] p-4">
      <div className="flex items-start justify-between gap-3">
        <Text as="h3" variant="smallTitle">
          Set your debate schedule
        </Text>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={handleDismiss}
          className="shrink-0 text-grey-04 transition-colors hover:text-text"
        >
          <CloseSmall />
        </button>
      </div>

      <Text as="p" variant="metadata" className="mt-2">
        Set the times you&rsquo;re free for debates. When you&rsquo;re offline, others can check your availability and
        request a time that works for both of you.
      </Text>

      <button
        ref={openerRef}
        type="button"
        onClick={() => setModalOpen(true)}
        className="mt-4 rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90"
      >
        Set my schedule
      </button>

      <AvailabilityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        blocks={blocks ?? []}
        onSave={nextBlocks => saveSchedule.mutate(nextBlocks)}
        openerRef={openerRef}
      />
    </div>
  );
}
