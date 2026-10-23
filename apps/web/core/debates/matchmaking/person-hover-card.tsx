'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { FollowButton } from '~/core/follows/follow-button';

import { Avatar } from '~/design-system/avatar';
import { OnlineDot } from '~/design-system/online-dot';

import type { DebatePerson } from '../api';
import { speakerLabel } from '../playback-utils';
import type { PersonRecord } from './person-record';

/**
 * How long the card waits after the pointer leaves the name before closing. Long enough to cross the
 * 8px gap onto the card, so Follow can be reached; any longer and moving down the list leaves a
 * trail of cards behind the pointer.
 */
const CLOSE_GRACE_MS = 150;

/** How long the pointer has to rest on a name first, so sweeping down the list opens nothing. */
const OPEN_DELAY_MS = 300;

export type PersonStatus = 'online' | 'away' | 'offline' | 'debating';

export function personStatusLabel(status: PersonStatus) {
  return status === 'online'
    ? 'Online now'
    : status === 'away'
      ? 'Away'
      : status === 'debating'
        ? 'In a debate'
        : 'Offline';
}

/**
 * Whether this device has a pointer that hovers. Touch screens never get the card (GEO-3463): a tap
 * there keeps following the name to the profile, as it always has. Read once per mount rather than
 * subscribed: a device does not grow a mouse mid-session often enough to pay a listener per row.
 */
function canHover() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover)').matches
    : false;
}

/**
 * A profile card on a People row's name (GEO-3463): status, debates and positions, the spaces they
 * are active in, their next free time, and Follow. It replaces the stats line the row used to carry,
 * so the row itself can say one useful thing.
 *
 * Opens on a resting mouse pointer only, and closes when the pointer leaves the name, after a short
 * grace that the card itself cancels so Follow stays reachable. `suppressed` keeps it shut while the
 * row's matches list is open, so the two never stack.
 *
 * A Radix popover, portaled into the panel's popover container, for the reason every hub popover is:
 * the panel closes on an outside pointer-down, and `[data-radix-popper-content-wrapper]` is one of
 * the selectors it spares.
 */
export function PersonHoverCard({
  person,
  status,
  record,
  spaceNames,
  nextFree,
  followable,
  suppressed,
  popoverPortal,
  hideWhenDetached = true,
  children,
}: {
  person: DebatePerson;
  status: PersonStatus;
  record: PersonRecord | null;
  /** Names of the spaces they are active in, already ordered. */
  spaceNames: string[];
  nextFree: string | null;
  /** Their profile id is a real space, so there is someone to follow. */
  followable: boolean;
  suppressed: boolean;
  popoverPortal: HTMLElement | null;
  hideWhenDetached?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  // The matches list opening is a click on this same row: the card goes at once rather than
  // lingering over the list for the grace period.
  React.useEffect(() => {
    if (!suppressed) return;
    clearTimers();
    setOpen(false);
  }, [clearTimers, suppressed]);

  const scheduleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

  const onEnter = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse' || suppressed || !canHover()) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, OPEN_DELAY_MS);
  };

  const name = speakerLabel(person);
  const debates = record?.debatesArgued ?? null;
  const positions = record?.positions ?? null;

  return (
    <Popover.Root open={open && !suppressed} onOpenChange={next => (next ? undefined : setOpen(false))}>
      <Popover.Anchor asChild>
        <span className="flex min-w-0" onPointerEnter={onEnter} onPointerLeave={scheduleClose}>
          {children}
        </span>
      </Popover.Anchor>
      {popoverPortal ? (
        <Popover.Portal container={popoverPortal}>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            hideWhenDetached={hideWhenDetached}
            aria-label={`About ${name}`}
            // A card that appears under a resting pointer must not take focus from wherever the
            // keyboard was, nor hand it back to the name when it goes.
            onOpenAutoFocus={event => event.preventDefault()}
            onCloseAutoFocus={event => event.preventDefault()}
            onPointerEnter={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }}
            onPointerLeave={scheduleClose}
            className="z-100 flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-2.5 rounded-lg border border-grey-02 bg-white p-3 shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 shrink-0">
                <div className="h-10 w-10 overflow-hidden rounded-full">
                  <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={40} />
                </div>
                {status === 'online' ? <OnlineDot faceSize={40} /> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-metadataMedium text-text">{name}</span>
                <span className="text-browseSection text-grey-04">{personStatusLabel(status)}</span>
              </div>
              {followable ? (
                <FollowButton target={{ kind: 'person', id: person.profile_space_id, name }} variant="compact" />
              ) : null}
            </div>
            {debates !== null || positions !== null ? (
              <p className="m-0 text-browseSection text-grey-04">
                {debates !== null ? (
                  <>
                    <span className="text-text tabular-nums">{debates}</span> {debates === 1 ? 'debate' : 'debates'}
                  </>
                ) : null}
                {debates !== null && positions !== null ? <span aria-hidden> · </span> : null}
                {positions !== null ? (
                  <>
                    <span className="text-text tabular-nums">{positions}</span>{' '}
                    {positions === 1 ? 'position' : 'positions'}
                  </>
                ) : null}
              </p>
            ) : null}
            {spaceNames.length > 0 ? (
              <p className="m-0 text-browseSection text-grey-04">
                Active in <span className="text-text">{spaceNames.join(', ')}</span>
              </p>
            ) : null}
            {nextFree ? <p className="m-0 text-browseSection text-text">{nextFree}</p> : null}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
