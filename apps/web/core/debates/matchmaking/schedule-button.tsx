'use client';

import * as React from 'react';

import cx from 'classnames';

import { summarizeSchedule } from '~/core/availability/schedule-summary';
import { useDebateSchedule, useGeoChatAuth } from '~/core/debates/hooks';

import { Calendar } from '~/design-system/icons/calendar';
import { Tooltip } from '~/design-system/tooltip';

import { OwnScheduleModal } from '~/partials/availability/own-schedule-modal';

import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_ICON_BUTTON_CLASS_NAME } from './hub-pill-button';

/**
 * The standing way into your debate schedule: a calendar beside the "I'm available" switch in the
 * hub header, on every tab.
 *
 * It sits there because the two answer one question — when can people debate me — the switch for
 * right now and this for later. The banner under the header only introduces it, and dismissing the
 * banner leaves this behind.
 *
 * Unset, it carries a brand-purple dot, so a viewer who closed the banner without setting anything
 * still has something quiet asking. Set, the tooltip reads the week back in one line, so
 * checking it does not mean opening the grid.
 */
export function ScheduleButton({ ref }: { ref?: React.RefObject<HTMLButtonElement | null> }) {
  const { authenticated } = useGeoChatAuth();
  const { blocks, isSet, data } = useDebateSchedule();
  const [modalOpen, setModalOpen] = React.useState(false);
  const ownRef = React.useRef<HTMLButtonElement | null>(null);
  // The hub passes its own, so the banner below can send focus here when it retires.
  const openerRef = ref ?? ownRef;

  // Keyed to the Privy account: signed out there is no schedule to read or save.
  if (!authenticated) return null;

  // The dot waits for the read. Drawing it before then would flash it at everyone who already has
  // a schedule, every time the panel opens.
  const showUnsetDot = data !== undefined && !isSet;
  const summary = isSet && blocks ? summarizeSchedule(blocks) : null;
  const label = isSet ? 'Edit your debate schedule' : 'Set your debate schedule';

  return (
    <>
      <Tooltip
        position="bottom"
        label={
          summary ? (
            <>
              <span className="block">Your schedule</span>
              <span className="block text-grey-03">{summary}</span>
            </>
          ) : (
            label
          )
        }
        trigger={
          <button
            ref={openerRef}
            type="button"
            aria-label={label}
            // Same intent as the banner's button, but its own label, so the two entry points can be
            // told apart in the click data.
            {...hubAnalyticsAttributes('Schedule calendar', 'open_debate_schedule')}
            onClick={() => setModalOpen(true)}
            className={cx(HUB_ICON_BUTTON_CLASS_NAME, 'relative')}
          >
            <Calendar />
            {showUnsetDot ? (
              <span
                aria-hidden="true"
                data-testid="schedule-unset-dot"
                className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full border-[1.5px] border-white bg-purple"
              />
            ) : null}
          </button>
        }
      />
      <OwnScheduleModal open={modalOpen} onOpenChange={setModalOpen} openerRef={openerRef} />
    </>
  );
}
