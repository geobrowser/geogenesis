'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { createPortal } from 'react-dom';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';
import { ElevatedPopoverPortalContext } from '~/design-system/use-elevated-popover-portal';

import { debateRoomPath } from '../rooms/room-routes';
import { useScrollLock } from '../use-scroll-lock';
import { useCreateDebateLobby } from './hooks';
import { lobbyShareUrl, markLobbyEntry } from './lobby-analytics';
import { MAX_SCHEDULE_AHEAD_DAYS, NAME_MAX_CHARS, lobbyErrorMessage, lobbyScheduleLabel } from './lobby-format';
import { OpenLobbyClaimListsField, type PickedClaimList, claimListsRequestField } from './open-lobby-claim-lists';

/** `<input type="datetime-local">` reads and writes local wall time without a zone. */
export function toDateTimeLocalValue(at: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The viewer's IANA zone, e.g. "Europe/Paris", which the date and time inputs are read in. */
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The request body for the form, or why it cannot be sent yet. */
export function lobbyRequestFor(
  name: string,
  when: 'now' | 'later',
  startsAtLocal: string,
  now: number = Date.now()
): { body: { name: string; starts_at?: string } } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name the lobby.' };
  if ([...trimmed].length > NAME_MAX_CHARS) return { error: `Keep the name to ${NAME_MAX_CHARS} characters.` };
  if (when === 'now') return { body: { name: trimmed } };
  const startsAt = new Date(startsAtLocal);
  if (!startsAtLocal || Number.isNaN(startsAt.getTime())) return { error: 'Pick a start time.' };
  if (startsAt.getTime() <= now) return { error: 'Pick a time in the future.' };
  if (startsAt.getTime() > now + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) {
    return { error: `Pick a time within ${MAX_SCHEDULE_AHEAD_DAYS} days.` };
  }
  return { body: { name: trimmed, starts_at: startsAt.toISOString() } };
}

/** Open a lobby now or schedule one, then hand over its link (GEO-3133, `lobbyHosting`). */
export function OpenLobbyDialog({ onClose }: { onClose: () => void }) {
  const titleId = React.useId();
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);
  const create = useCreateDebateLobby();
  const [name, setName] = React.useState('');
  const [when, setWhen] = React.useState<'now' | 'later'>('now');
  const [initialStart] = React.useState(() => toDateTimeLocalValue(new Date(Date.now() + 60 * 60_000)));
  const [startDate, setStartDate] = React.useState(initialStart.slice(0, 10));
  const [startTime, setStartTime] = React.useState(initialStart.slice(11));
  const [timeZone] = React.useState(localTimeZone);
  const [claimLists, setClaimLists] = React.useState<PickedClaimList[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  useScrollLock();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A layer opened over the dialog (the claim list picker) handles its own Escape and marks it
      // handled, so that press closes the layer, not the dialog under it.
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const created = create.data ?? null;
  const link = created ? lobbyShareUrl(created.lobby_id) : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const request = lobbyRequestFor(name, when, startDate && startTime ? `${startDate}T${startTime}` : '');
    if ('error' in request) {
      setFormError(request.error);
      return;
    }
    setFormError(null);
    create.mutate({ ...request.body, ...claimListsRequestField(claimLists) });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return createPortal(
    <div
      ref={setPopoverContainer}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="grid max-h-full w-[min(560px,100%)] gap-5 overflow-y-auto rounded-lg bg-white p-5 text-text shadow-card">
        <div className="grid gap-1.5">
          <h2 id={titleId}>
            <Text as="span" variant="smallTitle">
              {created ? 'Your lobby is ready' : 'Open a debate lobby'}
            </Text>
          </h2>
          {created ? null : (
            <Text as="p" variant="metadata" color="grey-04">
              A voice room anyone can join. People pair off into recorded debates and come back.
            </Text>
          )}
        </div>

        {created && link ? (
          <>
            <div className="grid gap-1">
              <Text as="p" variant="metadata">
                {created.name}
              </Text>
              <Text as="p" variant="footnote" color="grey-04">
                {lobbyScheduleLabel({ ...created, open: created.access.status === 'admitted' }) ?? 'Open now'}
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={link} aria-label="Lobby link" onFocus={event => event.currentTarget.select()} />
              <button type="button" onClick={copy} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
                Done
              </button>
              <Link
                href={debateRoomPath(created.lobby_id)}
                onClick={() => {
                  markLobbyEntry(created.lobby_id, 'created');
                  onClose();
                }}
                className={`${DIALOG_ACTION_BUTTON_CLASS_NAME} text-center`}
              >
                Go to lobby
              </Link>
            </div>
          </>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-1.5">
              <Text as="span" variant="footnoteMedium">
                Name
              </Text>
              <Input value={name} placeholder="Debate hour" onChange={event => setName(event.target.value)} autoFocus />
            </label>

            <RadioGroup.Root
              aria-label="When"
              value={when}
              onValueChange={value => setWhen(value === 'later' ? 'later' : 'now')}
              className="grid gap-1.5"
            >
              <Text as="span" variant="footnoteMedium">
                When
              </Text>
              <div className="space-y-1 rounded-lg border border-grey-02 p-1">
                <WhenOption value="now" selected={when === 'now'}>
                  Open now
                </WhenOption>
                <WhenOption value="later" selected={when === 'later'}>
                  Schedule a start time
                </WhenOption>
              </div>
            </RadioGroup.Root>

            {when === 'later' ? (
              <div className="grid gap-1.5">
                <div className="flex items-end gap-3">
                  <label className="grid min-w-0 flex-1 gap-1.5">
                    <Text as="span" variant="footnoteMedium">
                      Date
                    </Text>
                    <Input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
                  </label>
                  <label className="grid min-w-0 flex-1 gap-1.5">
                    <Text as="span" variant="footnoteMedium">
                      Start time
                      {timeZone ? (
                        <Text as="span" variant="footnote" color="grey-04">
                          {' '}
                          · {timeZone}
                        </Text>
                      ) : null}
                    </Text>
                    <Input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} />
                  </label>
                </div>
                <Text as="p" variant="footnote" color="grey-04">
                  Opens 10 minutes early. The link works now.
                </Text>
              </div>
            ) : null}

            <ElevatedPopoverPortalContext.Provider value={popoverContainer}>
              <OpenLobbyClaimListsField value={claimLists} onChange={setClaimLists} />
            </ElevatedPopoverPortalContext.Provider>

            {formError || create.error ? (
              <Text as="p" variant="footnote" color="red-01">
                {formError ?? lobbyErrorMessage(create.error, 'Could not open the lobby. Try again.')}
              </Text>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
                {create.isPending ? 'Opening…' : when === 'now' ? 'Open lobby' : 'Schedule lobby'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}

/** A row of the When choice, drawn like the framed device chooser (device-option-group.tsx). */
function WhenOption({ value, selected, children }: { value: string; selected: boolean; children: React.ReactNode }) {
  return (
    <RadioGroup.Item
      value={value}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-md px-4 py-3 text-left text-metadata text-text outline-none',
        selected ? 'bg-grey-01' : 'hover:bg-grey-01',
        'focus-visible:ring-1 focus-visible:ring-text'
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {selected && (
        <span aria-hidden="true" className="shrink-0">
          <Check />
        </span>
      )}
    </RadioGroup.Item>
  );
}
