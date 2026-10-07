'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useActionContext } from '~/core/action-context-provider';
import { copyAvailabilityLink } from '~/core/availability/availability-deep-link';
import { summarizeSchedule } from '~/core/availability/schedule-summary';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { OwnScheduleModal } from '~/partials/availability/own-schedule-modal';

import { useDebateActivity, useDebateSchedule, useGeoChatAuth, useUpdateDebateAvailability } from '../hooks';
import { type DebateAnalyticsSurface, debateActionAnalyticsAttributes } from './hub-analytics';
import { hubPillClassName } from './hub-pill-button';

/** How long "Link copied" stays before the row reads as a link again. */
const COPIED_MS = 2000;

/**
 * The hub header's right-hand controls, shared by the side panel, the full-screen hub and the
 * calendar so they cannot drift apart. Draws nothing of its own signed out. `children` trail it:
 * the panel's Calendar and Close.
 */
export function HubHeaderControls({
  scheduleButtonRef,
  analyticsSurface = 'hub',
  children,
}: {
  /** The set-schedule banner sends focus here when it retires. */
  scheduleButtonRef?: React.RefObject<HTMLButtonElement | null>;
  /** Whose clicks these are: the hub's, or the calendar's on its own page. */
  analyticsSurface?: DebateAnalyticsSurface;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <AvailabilityMenu triggerRef={scheduleButtonRef} analyticsSurface={analyticsSurface} />
      {children}
    </div>
  );
}

/**
 * Your availability, as one small status pill (GEO-3152): a green dot and "Available" while you take
 * live requests, a grey one and "Not available" otherwise. It opens onto both halves of "when can
 * people debate me": the live switch for right now, and Set / Edit my availability, the weekly
 * times others book, plus the link that books you.
 *
 * It replaced a full-width "I'm available" switch and a calendar icon for the weekly editor, which
 * sat beside the Calendar button looking identical to it while meaning something else.
 *
 * With no weekly times saved, the pill carries the brand-purple dot the old calendar icon did, so
 * the ask is still there on screens without the set-schedule banner.
 */
function AvailabilityMenu({
  triggerRef,
  analyticsSurface,
}: {
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  analyticsSurface: DebateAnalyticsSurface;
}) {
  const { authenticated } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const updateAvailability = useUpdateDebateAvailability();
  const { blocks, isSet, data: schedule } = useDebateSchedule();
  const popoverPortal = useElevatedPopoverPortal();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const ownRef = React.useRef<HTMLButtonElement | null>(null);
  const openerRef = triggerRef ?? ownRef;

  if (!authenticated) return null;

  const available = activity?.available_to_debate ?? false;
  const scheduleUnset = schedule !== undefined && !isSet;
  const summary = isSet && blocks ? summarizeSchedule(blocks) : null;

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            ref={openerRef}
            type="button"
            aria-label={`Your availability: ${available ? 'available' : 'not available'}${scheduleUnset ? ', weekly times not set' : ''}`}
            {...debateActionAnalyticsAttributes(analyticsSurface, 'Availability menu', 'open_availability_menu')}
            className={hubPillClassName('secondary', cx('relative gap-1.5 px-2.5', !available && 'text-grey-04'))}
          >
            <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', available ? 'bg-green' : 'bg-grey-03')} />
            {available ? 'Available' : 'Not available'}
            <ChevronDownSmall />
            {scheduleUnset ? (
              <span
                aria-hidden="true"
                data-testid="schedule-unset-dot"
                className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-purple ring-2 ring-white"
              />
            ) : null}
          </button>
        </Popover.Trigger>
        {popoverPortal ? (
          <Popover.Portal container={popoverPortal}>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={8}
              collisionPadding={16}
              aria-label="Your availability"
              className="z-100 w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-grey-02 bg-white p-1.5 shadow-lg"
            >
              <div className="flex items-start gap-2.5 rounded-lg p-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-metadataMedium text-text">Available now</span>
                  <span className="text-footnote text-grey-04">People can send you a debate request right now.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Available now"
                  aria-checked={available}
                  disabled={updateAvailability.isPending}
                  data-geo-analytics-label="Debate availability"
                  data-geo-analytics-intent="update_debate_availability"
                  onClick={() => updateAvailability.mutate(!available)}
                  className={cx(
                    'relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors disabled:cursor-wait',
                    available ? 'bg-green' : 'bg-grey-03'
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                      available && 'translate-x-3'
                    )}
                  />
                </button>
              </div>

              {/* One row, one press, the way the copy-link row below it works. */}
              <button
                type="button"
                {...debateActionAnalyticsAttributes(analyticsSurface, 'Schedule calendar', 'open_debate_schedule')}
                onClick={() => {
                  setOpen(false);
                  setEditing(true);
                }}
                className="flex w-full flex-col gap-0.5 border-t border-grey-01 p-2.5 text-left transition-colors hover:bg-grey-01"
              >
                <span className="text-metadataMedium text-text">
                  {isSet ? 'Edit my availability' : 'Set my availability'}
                </span>
                <span className="text-footnote text-grey-04">
                  {summary ? `${summary} · others can book these` : 'The times others can book you for.'}
                </span>
              </button>

              <CopyBookingLink />
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
      <OwnScheduleModal
        open={editing}
        onOpenChange={setEditing}
        openerRef={openerRef}
        // Saves are attributed to the screen the editor was opened from, as its click label is.
        surface={analyticsSurface === 'calendar' ? 'calendar' : 'hub_header'}
      />
    </>
  );
}

/** The link to your profile's bookable week, confirmed in place. Needs your personal space. */
function CopyBookingLink() {
  const { personalSpaceId } = usePersonalSpaceId();
  const getContext = useActionContext('share_dialog', 'space', personalSpaceId ?? '');
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');

  React.useEffect(() => {
    if (state === 'idle') return;
    const timeout = setTimeout(() => setState('idle'), COPIED_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  if (!personalSpaceId) return null;

  return (
    <button
      type="button"
      data-geo-analytics-label="Availability menu copy availability link"
      data-geo-analytics-intent="copy_availability_link"
      onClick={async () => {
        try {
          await copyAvailabilityLink(personalSpaceId, getContext());
          setState('copied');
        } catch {
          setState('failed');
        }
      }}
      className="flex w-full border-t border-grey-01 p-2.5 text-left text-metadata text-text transition-colors hover:bg-grey-01"
    >
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Couldn’t copy the link' : 'Copy link to book you'}
    </button>
  );
}
