'use client';

import * as React from 'react';

import type { CalendarConnectSource } from '~/core/availability/calendar-analytics';
import type { CalendarConnection, CalendarProvider } from '~/core/debates/api';
import {
  isCalendarSyncing,
  useCalendarConnections,
  useConnectCalendar,
  useDisconnectCalendar,
  useRefreshCalendar,
} from '~/core/debates/calendar-hooks';

import { Text } from '~/design-system/text';

import {
  calendarName,
  calendarReturnCopy,
  connectionErrorCopy,
  requestErrorCopy,
  signInName,
  syncedAgo,
} from './calendar-copy';
import { type CalendarReturn, calendarReturnTo } from './calendar-return-url';

const PRIMARY_BUTTON =
  'rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';
const SECONDARY_BUTTON =
  'rounded-full border border-grey-02 px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40';
const TEXT_BUTTON = 'rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text';

/**
 * Connected calendars in the viewer's schedule editor, one row per flagged provider. geo-chat reads
 * only busy times and takes them out of their availability; it never adds time.
 */
export function CalendarSection({
  providers,
  unsavedChanges = false,
  returned = null,
}: {
  providers: CalendarProvider[];
  /** Connecting leaves the page, which would drop the grid's draft. */
  unsavedChanges?: boolean;
  /** How connecting went, when the editor was reopened on the way back from the provider. */
  returned?: CalendarReturn | null;
}) {
  const connections = useCalendarConnections(true);

  // Off server-side: nothing to offer, so nothing to draw.
  if (connections.disabled) return null;

  if (connections.google === undefined) {
    if (!connections.isError) return null;
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg bg-grey-01 p-3">
        <Text as="p" variant="footnote" color="grey-04">
          We couldn’t load your calendar.
        </Text>
        <button type="button" onClick={() => connections.refetch()} className={SECONDARY_BUTTON}>
          Try again
        </button>
      </div>
    );
  }

  // Flagged on here and configured in geo-chat, in geo-chat's order.
  const shown = (connections.providers ?? []).filter(provider => providers.includes(provider));
  if (shown.length === 0) return null;
  const unconnected = shown.filter(provider => !connections[provider]);

  return (
    <section
      aria-label={shown.length === 1 ? calendarName(shown[0]) : 'Calendars'}
      className="flex shrink-0 flex-col gap-2"
    >
      {returned ? (
        <p role="status" className={returned.outcome === 'error' ? 'text-footnote text-red-01' : 'text-footnote'}>
          {calendarReturnCopy(returned.provider, returned.outcome, returned.reason)}
        </p>
      ) : null}
      {shown.map(provider => {
        const connection = connections[provider];
        return connection ? (
          <ConnectedCalendar
            key={provider}
            provider={provider}
            connection={connection}
            unsavedChanges={unsavedChanges}
          />
        ) : null;
      })}
      {unconnected.length > 0 ? <ConnectCalendar providers={unconnected} unsavedChanges={unsavedChanges} /> : null}
    </section>
  );
}

/** Sends the browser to the provider; geo-chat sends it back here with `?calendar=…`, reopening this editor. */
function useConnect() {
  const connect = useConnectCalendar();
  const start = (provider: CalendarProvider, source: CalendarConnectSource) =>
    connect.mutate(
      { provider, returnTo: calendarReturnTo(provider, window.location.href), source },
      {
        onSuccess: ({ authorization_url }) => window.location.assign(authorization_url),
      }
    );
  return {
    start,
    // Still pending while the browser leaves, so the buttons stay disabled.
    pending: connect.isPending || connect.isSuccess,
    pendingProvider: connect.isPending || connect.isSuccess ? connect.variables?.provider : undefined,
    error: connect.isError ? connect.error : null,
  };
}

function SaveFirstHint() {
  return (
    <Text as="p" variant="footnote" color="grey-04">
      Save your hours first.
    </Text>
  );
}

function ConnectCalendar({ providers, unsavedChanges }: { providers: CalendarProvider[]; unsavedChanges: boolean }) {
  const connect = useConnect();
  const where = providers.length === 1 ? calendarName(providers[0]) : 'your calendar';

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-grey-01 p-3">
      <div className="flex items-center justify-between gap-3">
        <Text as="p" variant="footnote">
          Block out times you’re busy on {where}. Geo only sees when you’re busy, never your events.
        </Text>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {providers.map(provider => (
            <button
              key={provider}
              type="button"
              onClick={() => connect.start(provider, 'connect')}
              disabled={connect.pending || unsavedChanges}
              className={PRIMARY_BUTTON}
            >
              {connect.pendingProvider === provider
                ? `Opening ${signInName(provider)}…`
                : `Connect ${calendarName(provider)}`}
            </button>
          ))}
        </div>
      </div>
      {unsavedChanges ? <SaveFirstHint /> : null}
      {connect.error ? (
        <p role="alert" className="text-footnote text-red-01">
          {requestErrorCopy(connect.error)}
        </p>
      ) : null}
    </div>
  );
}

function ConnectedCalendar({
  provider,
  connection,
  unsavedChanges,
}: {
  provider: CalendarProvider;
  connection: CalendarConnection;
  unsavedChanges: boolean;
}) {
  const connect = useConnect();
  const refresh = useRefreshCalendar(provider);
  const disconnect = useDisconnectCalendar(provider);
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);
  const needsReconnect = connection.status === 'needs_reconnect';
  // Reconnecting the same account would fail the same way.
  const needsOtherAccount = connection.last_error === 'mailbox_unavailable';
  const syncing = isCalendarSyncing(connection);
  const requestError = connect.error ?? (refresh.isError ? refresh.error : null);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg bg-grey-01 p-3"
      data-calendar-provider={provider}
      data-calendar-status={connection.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text as="p" variant="metadataMedium">
            {calendarName(provider)}
          </Text>
          {connection.account_email ? (
            <Text as="p" variant="footnote" color="grey-04" className="truncate">
              {connection.account_email}
            </Text>
          ) : null}
        </div>
        {confirmingDisconnect ? null : (
          <div className="flex shrink-0 items-center gap-2">
            {/* Refresh does nothing while access is gone, so Reconnect takes its place. */}
            {needsReconnect ? (
              <button
                type="button"
                onClick={() => connect.start(provider, 'reconnect')}
                disabled={connect.pending || unsavedChanges}
                className={PRIMARY_BUTTON}
              >
                {connect.pending
                  ? `Opening ${signInName(provider)}…`
                  : needsOtherAccount
                    ? 'Use another account'
                    : 'Reconnect'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className={SECONDARY_BUTTON}
              >
                {refresh.isPending ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            <button type="button" onClick={() => setConfirmingDisconnect(true)} className={SECONDARY_BUTTON}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {needsReconnect && unsavedChanges ? <SaveFirstHint /> : null}

      {connection.status === 'ok' ? null : (
        <Text as="p" variant="footnote" className="text-red-01">
          {connectionErrorCopy(provider, connection.last_error)}
        </Text>
      )}
      <Text as="p" variant="footnote" color="grey-04">
        {syncing ? 'Syncing…' : syncedAgo(connection.last_success_at)}
      </Text>

      {connection.stale && !needsReconnect && !syncing ? (
        <Text as="p" variant="footnote" className="text-red-01">
          Calendar hasn’t synced recently, so busy times aren’t being taken out of your availability.
        </Text>
      ) : null}

      {requestError ? (
        <p role="alert" className="text-footnote text-red-01">
          {requestErrorCopy(requestError)}
        </p>
      ) : null}

      {confirmingDisconnect ? (
        <div className="flex flex-col gap-2">
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
          <div className="flex items-center justify-end gap-2">
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
      ) : null}
    </div>
  );
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
