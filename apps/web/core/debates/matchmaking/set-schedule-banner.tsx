'use client';

import * as React from 'react';

import cx from 'classnames';

import { localTimezone } from '~/core/availability/blocks';
import { hasUpcomingAvailability } from '~/core/availability/upcoming-availability';
import { useDebateSchedule, useGeoChatAuth } from '~/core/debates/hooks';

import { ClientOnly } from '~/design-system/client-only';
import { Text } from '~/design-system/text';

import { OwnScheduleModal } from '~/partials/availability/own-schedule-modal';

import { debateAnalyticsLabel } from './hub-analytics';
import { HubPillButton } from './hub-pill-button';

/**
 * "Debate schedule" — the callout at the top of the debates panel, above the tabs, whose
 * button opens the availability calendar (GEO-2936). The debate calendar page shows the same
 * callout above its week.
 *
 * It cannot be dismissed. It stays up for as long as the viewer offers no time anyone could book:
 * no schedule saved, one cleared back to nothing, or one whose only times are one-off dates now
 * past. Once there is upcoming time it retires, because the header's availability pill is where
 * the schedule lives from then on, and comes back if that time runs out.
 *
 * Behind `ClientOnly` because whether time is still upcoming depends on the browser's clock and the
 * viewer's saved schedule, neither of which the server render has.
 */
type Props = {
  /**
   * The header's availability pill. A save that retires the banner takes the focused control with
   * it, so focus moves up here rather than dropping to the page.
   */
  scheduleButtonRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * Whose clicks and saves these are: the debates panel's, or the calendar page's. Also sets the
   * title's level, one under the surface's own heading: the panel's h2, the page's h1.
   */
  surface?: 'hub' | 'calendar';
  /** Replaces the panel's spacing, for a page with its own gutters. */
  className?: string;
};

export function SetScheduleBanner(props: Props) {
  return (
    <ClientOnly>
      <Banner {...props} />
    </ClientOnly>
  );
}

/**
 * The part of asking for times that every prompt shares (this banner and the panel's one-line
 * `NoTimesNudge`): whether the viewer offers no time anyone could book, and the editor its button
 * opens, with focus handed on when a save retires the prompt.
 *
 * Render `modal` in the same place whether or not the prompt shows: a save retires the prompt while
 * the editor is still closing, and moving it would remount it.
 */
export function useSetTimesPrompt({
  scheduleButtonRef,
  surface = 'hub',
}: Pick<Props, 'scheduleButtonRef' | 'surface'>) {
  const { authenticated } = useGeoChatAuth();
  const [editing, setEditing] = React.useState(false);
  // Saved server-side (GEO-2932). The modal reads and saves the week itself; this only asks whether
  // it still offers anything.
  const { data, blocks } = useDebateSchedule();
  // Where the dialog returns focus on close. The prompt's own button, unless the save retires the
  // prompt moments later, and focus parked on its button would go with it.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  // A schedule is keyed to the Privy account, so signed out the read stays disabled and the modal it
  // opens has nothing to resolve to. And it waits for the read rather than defaulting to "unset":
  // everyone who already has a schedule would otherwise watch the prompt appear and vanish each time
  // the panel opens.
  const noTimes = authenticated && data !== undefined && !hasUpcomingAvailability(blocks, data.schedule.timezone);

  const openEditor = (opener: HTMLElement | null) => {
    returnFocusRef.current = opener;
    setEditing(true);
  };

  const modal = (
    <OwnScheduleModal
      open={editing}
      onOpenChange={setEditing}
      openerRef={returnFocusRef}
      surface={surface === 'calendar' ? 'calendar' : 'hub_banner'}
      onSaved={saved => {
        // A save with no upcoming time leaves the prompt up, so focus comes back to its button.
        if (scheduleButtonRef?.current && hasUpcomingAvailability(saved, localTimezone())) {
          returnFocusRef.current = scheduleButtonRef.current;
        }
      }}
    />
  );

  return { noTimes, editing, openEditor, modal };
}

function Banner({ scheduleButtonRef, surface = 'hub', className }: Props) {
  const { noTimes, editing, openEditor, modal } = useSetTimesPrompt({ scheduleButtonRef, surface });
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  if (!noTimes && !editing) return null;

  // Retired mid-edit, only the callout goes. The modal keeps its place in the tree, so React keeps
  // the one already open rather than mounting a fresh one.
  return (
    <div className={noTimes ? cx(className ?? 'mx-4 mb-3', 'rounded-lg bg-purple-tint p-4') : 'contents'}>
      {noTimes ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Text as={surface === 'calendar' ? 'h2' : 'h3'} variant="smallTitle">
              Debate schedule
            </Text>
            <HubPillButton
              ref={openerRef}
              variant="primary"
              analyticsSurface={surface}
              analyticsLabel={debateAnalyticsLabel(surface, 'Open schedule')}
              analyticsIntent="open_debate_schedule"
              onClick={() => openEditor(openerRef.current)}
            >
              Set my schedule
            </HubPillButton>
          </div>

          <Text as="p" variant="metadata" className="mt-2">
            Set the times you’re free for debates. Others can check your availability and request a time that works for
            both of you. You can change it any time in the dropdown above.
          </Text>
        </>
      ) : null}
      {modal}
    </div>
  );
}
