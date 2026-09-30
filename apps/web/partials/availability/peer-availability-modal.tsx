'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import type * as React from 'react';

import cx from 'classnames';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Close } from '~/design-system/icons/close';

import { PeerAvailability, type PeerAvailabilityBooking } from './peer-availability';

type Props = {
  open: boolean;
  /** Absent leaves the week read-only, as on the debug page. */
  booking?: PeerAvailabilityBooking;
  /** The person whose week is being looked at. Nothing else about them is needed. */
  userId: string;
  peerName?: string | null;
  /**
   * Required: only the caller knows where closing goes. A hub row returns to the hub; a route
   * reached from a shared link has no history behind it and should send Explore.
   */
  onClose: () => void;
  /** Focus goes back here on close, when it is still in the document. */
  openerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Drawn in place of the week. A shared link opens this before it knows whose week it is — the
   * recipient may be signed out, or their profile still resolving — and says so in the same shell
   * rather than swapping dialogs under them once it does.
   */
  children?: React.ReactNode;
  /** Opens with this slot already picked. */
  initialSelectedStart?: string | null;
  /** What opened it, for analytics. */
  entry?: ScheduleEntry | null;
  /** Claims the viewer and this person disagree on, when the caller has compared them. */
  disagreementCount?: number | null;
};

/**
 * "When someone is free", full screen and on its own (GEO-2938).
 *
 * Isolated deliberately: no nav, no filters, nobody else's availability. Looking up one person's
 * week is the whole job, and the surfaces that lead here all lead from somewhere with plenty of
 * chrome already.
 *
 * Drives the Radix primitives directly rather than using the shared `Dialog`, which is narrower
 * than seven day columns — the same reason `availability-modal` does, and it carries that modal's
 * mobile fixes with it.
 */
export function PeerAvailabilityModal({
  open,
  userId,
  peerName,
  onClose,
  openerRef,
  booking,
  children,
  initialSelectedStart,
  entry = null,
  disagreementCount = null,
}: Props) {
  return (
    <Root open={open} onOpenChange={next => !next && onClose()}>
      <Portal>
        <Overlay className={cx('fixed inset-0 bg-text/20', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            // The opener is a row in a live list and may have unmounted while this was open.
            // Radix's own restore is a no-op on a detached node, so hand it back only if it is
            // still there and let the default run otherwise.
            const opener = openerRef?.current;
            if (!opener?.isConnected) return;
            event.preventDefault();
            opener.focus();
          }}
          className={cx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-hidden md:inset-0 md:translate-x-0 md:translate-y-0',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          {/* `data-no-sheet-drag` for the same reason the schedule editor carries it: React events
              cross portals by the component tree rather than the DOM, so opened from the debates
              hub this content is inside its bottom sheet as far as React is concerned, and a drag
              over the day list would otherwise dismiss the sheet out from under it.

              A column with a hard ceiling — the header stays put and the grid takes what is left,
              so nothing can push the close button off a short window. */}
          <div
            data-no-sheet-drag
            className="relative flex max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden overscroll-none rounded-xl bg-white p-5 shadow-card md:h-dvh md:max-h-dvh md:w-screen md:max-w-none md:gap-3 md:rounded-none md:p-4"
          >
            {/* The week's own "When … is free" is the visible heading, so the dialog's name is for
                assistive tech only. It is here rather than on that heading because the view also
                renders outside a dialog (the debug page), where a Radix `Title` would throw. */}
            <Title asChild>
              {/* A span, not Radix's default `h2`, so it doesn't sit beside the visible one as a
                  second heading with the same name. */}
              <span className="sr-only">{peerName ? `When ${peerName} is free` : 'Availability'}</span>
            </Title>
            <button
              type="button"
              aria-label="Close"
              {...debateActionAnalyticsAttributes('peer-availability', 'Close', 'close_peer_availability')}
              onClick={onClose}
              className="absolute top-6 right-5 z-10 grid size-4 place-items-center text-[#151515] transition-opacity hover:opacity-70 md:top-5 md:right-4"
            >
              <Close />
            </button>

            {/* Mounted only while open, so a closed dialog issues no request. It is also what keeps
                an empty `userId` away from the hook while nobody is selected. */}
            {open &&
              (children ?? (
                <PeerAvailability
                  userId={userId}
                  peerName={peerName}
                  className="min-h-0 flex-1"
                  booking={booking}
                  initialSelectedStart={initialSelectedStart}
                  entry={entry}
                  disagreementCount={disagreementCount}
                />
              ))}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
