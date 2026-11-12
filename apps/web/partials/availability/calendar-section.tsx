'use client';

import * as React from 'react';

import cx from 'classnames';

import type { CalendarConnectSource } from '~/core/availability/calendar-analytics';
import { SCHEDULE_SAVE_FAILED_COPY } from '~/core/availability/schedule-save-copy';
import { type CalendarConnection, type CalendarProvider, isAccountWarmingUpQuery } from '~/core/debates/api';
import {
  isCalendarSyncing,
  useCalendarConnections,
  useConnectCalendar,
  useDisconnectCalendar,
  useRefreshCalendar,
} from '~/core/debates/calendar-hooks';

import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import {
  calendarName,
  calendarReturnCopy,
  connectionErrorCopy,
  requestErrorCopy,
  signInName,
  syncedAgo,
} from './calendar-copy';
import { CalendarProviderLogo } from './calendar-provider-logo';
import { type CalendarReturn, calendarReturnTo } from './calendar-return-url';

const PRIMARY_BUTTON =
  'rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';
const SECONDARY_BUTTON =
  'rounded-full border border-grey-02 px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40';
const TEXT_BUTTON = 'rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text';
const CHIP = 'inline-flex shrink-0 items-center rounded-full border text-metadata';
const STALE = 'Calendar hasn’t synced recently, so busy times aren’t being taken out of your availability.';

/**
 * Connected calendars in the viewer's schedule editor, as one row of chips above the grid (GEO-3595):
 * one per provider geo-chat has configured, connected or not. geo-chat reads only busy times and takes them out of
 * their availability; it never adds time.
 */
export function CalendarSection({
  unsavedChanges = false,
  saveDraft,
  returned = null,
}: {
  /** The grid has edits that connecting, which leaves the page, would otherwise drop. */
  unsavedChanges?: boolean;
  /** Saves those edits without closing the editor; a connect runs it first. */
  saveDraft?: () => Promise<unknown>;
  /** How connecting went, when the editor was reopened on the way back from the provider. */
  returned?: CalendarReturn | null;
}) {
  const connections = useCalendarConnections(true);
  const connect = useConnect({ unsavedChanges, saveDraft });
  const refresh = { google: useRefreshCalendar('google'), microsoft: useRefreshCalendar('microsoft') };

  // Off server-side: nothing to offer, so nothing to draw.
  if (connections.disabled) return null;

  if (connections.google === undefined) {
    // A session geo-chat hasn't finished setting up: the editor already says so, and it clears by itself.
    if (!connections.isError || isAccountWarmingUpQuery(connections)) return null;
    return (
      <div className="flex shrink-0 items-center gap-3">
        <Text as="p" variant="footnote" color="grey-04">
          We couldn’t load your calendar.
        </Text>
        <button type="button" onClick={() => connections.refetch()} className={SECONDARY_BUTTON}>
          Try again
        </button>
      </div>
    );
  }

  // Configured in geo-chat, in geo-chat's order.
  const shown = connections.providers ?? [];
  if (shown.length === 0) return null;
  const anyUnconnected = shown.some(provider => !connections[provider]);

  // One line per calendar at most: what just went wrong with a request, else how coming back from
  // the provider went wrong, else what is wrong with the connection itself.
  const lines = shown.flatMap((provider): CalendarLine[] => {
    const connection = connections[provider];
    const requestLine =
      connect.errorLine(provider) ?? (refresh[provider].isError ? requestErrorCopy(refresh[provider].error) : null);
    if (requestLine) return [{ provider, text: requestLine, role: 'alert' }];
    if (returned?.outcome === 'error' && returned.provider === provider) {
      return [{ provider, text: calendarReturnCopy(provider, 'error', returned.reason), role: 'status' }];
    }
    const problem = connection ? connectionProblem(provider, connection) : null;
    return problem ? [{ provider, text: problem }] : [];
  });

  return (
    <section
      aria-label={shown.length === 1 ? calendarName(shown[0]) : 'Calendars'}
      className="flex shrink-0 flex-col gap-1.5"
    >
      {/* Wraps on a desktop; on a phone, one row that scrolls sideways, edge to edge. */}
      <div className="no-scrollbar flex flex-wrap items-center gap-2 md:-mx-4 md:flex-nowrap md:overflow-x-auto md:px-4">
        {shown.map(provider => {
          const connection = connections[provider];
          return connection ? (
            <ConnectedChip
              key={provider}
              provider={provider}
              connection={connection}
              connect={connect}
              refresh={refresh[provider]}
              justConnected={returned?.outcome === 'connected' && returned.provider === provider}
            />
          ) : (
            <button
              key={provider}
              type="button"
              onClick={() => connect.start(provider, 'connect')}
              disabled={connect.blocked}
              className={cx(
                CHIP,
                'gap-2 border-grey-02 bg-white py-1 pr-3 pl-1.5 text-grey-04 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40'
              )}
            >
              <CalendarProviderLogo provider={provider} />
              {connect.pendingProvider === provider
                ? `Opening ${signInName(provider)}…`
                : `Connect ${calendarName(provider)}`}
            </button>
          );
        })}
        {anyUnconnected ? (
          <Text as="p" variant="footnote" color="grey-04" className="px-1 md:shrink-0 md:whitespace-nowrap">
            Geo only sees when you’re busy, never your events.
          </Text>
        ) : null}
      </div>

      {lines.map(line => (
        <p
          key={line.provider}
          role={line.role}
          data-calendar-line={line.provider}
          className="px-1 text-footnote text-red-01"
        >
          {line.text}
        </p>
      ))}

      {returned?.outcome === 'connected' ? (
        <p role="status" className="px-1 text-footnote">
          {calendarReturnCopy(returned.provider, 'connected', null)}
        </p>
      ) : null}
    </section>
  );
}

type CalendarLine = { provider: CalendarProvider; text: string; role?: 'alert' | 'status' };

/** What the line under the row says about a connection, or nothing while it is fine. */
function connectionProblem(provider: CalendarProvider, connection: CalendarConnection) {
  if (connection.status !== 'ok') return connectionErrorCopy(provider, connection.last_error);
  if (connection.stale && !isCalendarSyncing(connection)) return STALE;
  return null;
}

type Connect = ReturnType<typeof useConnect>;

/**
 * Sends the browser to the provider; geo-chat sends it back here with `?calendar=…`, reopening this
 * editor. Unsaved edits are saved first, since leaving would drop them; a failed save stays here,
 * edits and all, rather than leaving without them.
 */
function useConnect({ unsavedChanges, saveDraft }: { unsavedChanges: boolean; saveDraft?: () => Promise<unknown> }) {
  const connect = useConnectCalendar();
  const [saving, setSaving] = React.useState<CalendarProvider | null>(null);
  const [saveFailed, setSaveFailed] = React.useState<CalendarProvider | null>(null);
  // Still pending while the browser leaves, so the buttons stay disabled.
  const leaving = connect.isPending || connect.isSuccess;
  const pending = saving !== null || leaving;

  const start = async (provider: CalendarProvider, source: CalendarConnectSource) => {
    if (pending) return;
    setSaveFailed(null);
    if (unsavedChanges && saveDraft) {
      setSaving(provider);
      try {
        await saveDraft();
      } catch {
        setSaveFailed(provider);
        return;
      } finally {
        setSaving(null);
      }
    }
    connect.mutate(
      { provider, returnTo: calendarReturnTo(provider, window.location.href), source },
      {
        onSuccess: ({ authorization_url }) => window.location.assign(authorization_url),
      }
    );
  };

  return {
    start,
    pending,
    /** Nothing can be started: one is under way, or there are edits with no way to save them. */
    blocked: pending || (unsavedChanges && !saveDraft),
    pendingProvider: saving ?? (leaving ? connect.variables?.provider : undefined),
    /** Why the last connect of `provider` went nowhere, as the line to show, or null. */
    errorLine: (provider: CalendarProvider) => {
      if (saveFailed === provider) return SCHEDULE_SAVE_FAILED_COPY;
      return connect.isError && connect.variables?.provider === provider ? requestErrorCopy(connect.error) : null;
    },
  };
}

function ConnectedChip({
  provider,
  connection,
  connect,
  refresh,
  justConnected,
}: {
  provider: CalendarProvider;
  connection: CalendarConnection;
  connect: Connect;
  refresh: ReturnType<typeof useRefreshCalendar>;
  /** Back from the provider with this one connected. */
  justConnected: boolean;
}) {
  const disconnect = useDisconnectCalendar(provider);
  const [open, setOpen] = React.useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);
  const view = useFocusOnViewSwitch(confirmingDisconnect);
  const needsReconnect = connection.status === 'needs_reconnect';
  const syncing = refresh.isPending || isCalendarSyncing(connection);
  // Reconnecting the same account would fail the same way.
  const needsOtherAccount = connection.last_error === 'mailbox_unavailable';
  const name = calendarName(provider);

  return (
    <div
      data-calendar-provider={provider}
      data-calendar-status={connection.status}
      className={cx(
        CHIP,
        needsReconnect ? 'border-red-03 bg-red-02' : open ? 'border-text bg-white' : 'border-grey-02 bg-white'
      )}
    >
      <Menu
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) setConfirmingDisconnect(false);
        }}
        asChild
        align="start"
        className="w-[320px]! max-w-[calc(100vw-2rem)]"
        trigger={
          <button type="button" className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2.5 pl-1.5 text-text">
            <CalendarProviderLogo provider={provider} />
            <span className="sr-only">{name}</span>
            <span className="max-w-[16rem] truncate">{connection.account_email ?? name}</span>
            {connection.status === 'ok' ? null : (
              <span aria-hidden className="block size-1.5 shrink-0 rounded-full bg-red-01" />
            )}
            {justConnected ? (
              <span className="shrink-0 text-[#1f9e78]" role="img" aria-label="Connected">
                <CheckCircleSmall />
              </span>
            ) : null}
            <span aria-hidden className="shrink-0 text-grey-04">
              <ChevronDownSmall />
            </span>
          </button>
        }
      >
        {confirmingDisconnect ? (
          <div ref={view} className="flex flex-col gap-2 p-3">
            <Text as="p" variant="metadataMedium">
              Disconnect {name}?
            </Text>
            {provider === 'microsoft' ? (
              <MicrosoftDisconnectCopy />
            ) : (
              <Text as="p" variant="footnote">
                Geo stops reading your calendar right away and gives up its access to it.
              </Text>
            )}
            {disconnect.isError ? (
              <p role="alert" className="text-footnote text-red-01">
                {requestErrorCopy(disconnect.error)}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setConfirmingDisconnect(false)} className={TEXT_BUTTON}>
                Keep
              </button>
              <button
                type="button"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className={PRIMARY_BUTTON}
              >
                {disconnect.isPending ? 'Disconnecting…' : 'Disconnect calendar'}
              </button>
            </div>
          </div>
        ) : (
          <div ref={view}>
            <Text as="p" variant="footnote" color="grey-04" className="border-b border-divider px-3 py-2.5">
              {syncing ? 'Syncing…' : syncedAgo(connection.last_success_at)}
            </Text>
            {/* Sync does nothing while access is gone, where Reconnect on the chip takes its place,
                and is not offered while one is running, a first sync included. */}
            {needsReconnect || syncing ? null : (
              <MenuItem
                onClick={() => {
                  refresh.mutate();
                  setOpen(false);
                }}
              >
                Sync now
              </MenuItem>
            )}
            <MenuItem onClick={() => setConfirmingDisconnect(true)}>Disconnect</MenuItem>
          </div>
        )}
      </Menu>
      {needsReconnect ? (
        <button
          type="button"
          onClick={() => connect.start(provider, 'reconnect')}
          disabled={connect.blocked}
          className="mr-1 shrink-0 rounded-full bg-[#151515] px-2.5 py-0.5 text-smallButton text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {connect.pendingProvider === provider
            ? `Opening ${signInName(provider)}…`
            : needsOtherAccount
              ? 'Use another account'
              : 'Reconnect'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Disconnect and Keep swap the menu's content, which unmounts the focused button and drops focus to
 * the dialog. Lands it on the new view instead: Keep, the safe choice, on the confirm; Disconnect,
 * where it came from, on the way back. Not on the first render, where Radix focuses the menu.
 */
function useFocusOnViewSwitch(confirming: boolean) {
  const view = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef(confirming);
  React.useEffect(() => {
    if (previous.current === confirming) return;
    previous.current = confirming;
    const buttons = view.current?.querySelectorAll<HTMLButtonElement>('button');
    (confirming ? buttons?.[0] : buttons?.[buttons.length - 1])?.focus();
  }, [confirming]);
  return view;
}

const LINK = 'underline underline-offset-2 hover:text-text';

/** Microsoft has no revoke call, so Geo stays listed on the account until the user removes it there. */
function MicrosoftDisconnectCopy() {
  return (
    <>
      <Text as="p" variant="footnote">
        Geo stops reading your calendar right away and deletes its access to it.
      </Text>
      <Text as="p" variant="footnote" color="grey-04">
        To remove Geo from your Microsoft account as well, go to{' '}
        <a href="https://account.live.com/consent/Manage" target="_blank" rel="noreferrer" className={LINK}>
          your app permissions
        </a>{' '}
        for a personal account, or{' '}
        <a href="https://myapps.microsoft.com" target="_blank" rel="noreferrer" className={LINK}>
          My Apps
        </a>{' '}
        for a work or school account.
      </Text>
    </>
  );
}
