'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { FollowButton } from '~/core/follows/follow-button';
import { useHoverIntent } from '~/core/hooks/use-hover-intent';
import { useMediaQuery } from '~/core/hooks/use-media-query';

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
 * A profile card on a People row's name (GEO-3463): status, debates and positions, the spaces they
 * are active in, their matches and next free time, and Follow. It replaces the stats line the row
 * used to carry, so the row itself can say one useful thing.
 *
 * Opens on a resting mouse pointer over the name only — `self-start` keeps the hover target to the
 * name itself rather than the width of the column, and moving restarts the wait, so sweeping across
 * to the row's buttons opens nothing. It closes when the pointer leaves the name, after a short grace
 * that the card itself cancels so Follow stays reachable, and at once on a click (the name is a link).
 * `suppressed` keeps it shut while the row's matches list is open, so the two never stack.
 *
 * Anchored on the whole column — name and fact line — so it opens below the fact line, as the
 * prototype's card does, rather than over the "N matches" link it would otherwise cover.
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
  matchCount,
  followable,
  suppressed,
  popoverPortal,
  hideWhenDetached = true,
  name: nameNode,
  children,
}: {
  person: DebatePerson;
  status: PersonStatus;
  record: PersonRecord | null;
  /** Names of the spaces they are active in, already ordered. */
  spaceNames: string[];
  nextFree: string | null;
  /** Claims the viewer and this person hold opposite sides on. */
  matchCount: number;
  /** Their profile id is a real space, so there is someone to follow. */
  followable: boolean;
  suppressed: boolean;
  popoverPortal: HTMLElement | null;
  hideWhenDetached?: boolean;
  /** The name, which is what the pointer rests on. */
  name: React.ReactNode;
  /** The rest of the column under the name (the fact line). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const intent = useHoverIntent({ openDelay: OPEN_DELAY_MS, closeDelay: CLOSE_GRACE_MS });

  // The matches list opening is a click on this same row: the card goes at once rather than
  // lingering over the list for the grace period.
  const { cancel } = intent;
  React.useEffect(() => {
    if (!suppressed) return;
    cancel();
    setOpen(false);
  }, [cancel, suppressed]);

  // Touch screens never get the card (GEO-3463): a tap there keeps following the name to the profile.
  const canHover = useMediaQuery('(hover: hover)');
  const restingMouse = (event: React.PointerEvent) => event.pointerType === 'mouse' && !suppressed && canHover;

  // Entering and moving both (re)start the wait: only a pointer that stops on the name opens it.
  // Already open, coming back onto the name keeps it: the close the pointer left behind is cancelled.
  const waitToOpen = (event: React.PointerEvent) => {
    if (!restingMouse(event)) return;
    if (open) {
      intent.cancel();
      return;
    }
    intent.openSoon(() => setOpen(true));
  };
  const closeSoon = () => intent.closeSoon(() => setOpen(false));
  const closeNow = () => {
    intent.cancel();
    setOpen(false);
  };

  const name = speakerLabel(person);
  const debates = record?.debatesArgued ?? null;
  const positions = record?.positions ?? null;
  const matchesLine = [matchCount > 0 ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}` : null, nextFree]
    .filter(Boolean)
    .join(' · ');

  return (
    <Popover.Root open={open && !suppressed} onOpenChange={next => (next ? undefined : setOpen(false))}>
      <Popover.Anchor asChild>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="inline-flex max-w-full min-w-0 self-start"
            onPointerEnter={waitToOpen}
            onPointerMove={waitToOpen}
            onPointerLeave={closeSoon}
            onClickCapture={closeNow}
          >
            {nameNode}
          </span>
          {children}
        </div>
      </Popover.Anchor>
      {popoverPortal ? (
        <Popover.Portal container={popoverPortal}>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={16}
            hideWhenDetached={hideWhenDetached}
            aria-label={`About ${name}`}
            // A card that appears under a resting pointer must not take focus from wherever the
            // keyboard was, nor hand it back to the name when it goes.
            onOpenAutoFocus={event => event.preventDefault()}
            onCloseAutoFocus={event => event.preventDefault()}
            onPointerEnter={intent.cancel}
            onPointerLeave={closeSoon}
            className="z-100 flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-lg border border-grey-02 bg-white p-3 shadow-lg"
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
              <p className="m-0 text-browseSection text-grey-05">
                {debates !== null ? (
                  <>
                    <span className="tabular-nums">{debates}</span> {debates === 1 ? 'debate' : 'debates'}
                  </>
                ) : null}
                {debates !== null && positions !== null ? <span aria-hidden> · </span> : null}
                {positions !== null ? (
                  <>
                    <span className="tabular-nums">{positions}</span> {positions === 1 ? 'position' : 'positions'}
                  </>
                ) : null}
              </p>
            ) : null}
            {spaceNames.length > 0 ? (
              <p className="m-0 text-browseSection text-grey-04">Active in {spaceNames.join(', ')}</p>
            ) : null}
            {matchesLine ? <p className="m-0 text-browseSection text-purple">{matchesLine}</p> : null}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
