'use client';

import * as React from 'react';

import type { GoogleCalendarConnection } from '~/core/debates/api';
import {
  useCalendarConnections,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
  useRefreshGoogleCalendar,
} from '~/core/debates/calendar-hooks';

import { Text } from '~/design-system/text';

import { connectionErrorCopy, requestErrorCopy, syncedAgo } from './google-calendar-copy';

const PRIMARY_BUTTON =
  'rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';
const SECONDARY_BUTTON =
  'rounded-full border border-grey-02 px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40';
const TEXT_BUTTON = 'rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text';

/**
 * Google Calendar in the viewer's own schedule editor. geo-chat reads only busy times and takes them
 * out of their debate availability; it never adds time. Behind `googleCalendar`.
 */
export function GoogleCalendarSection() {
  const { google, isError, disabled, refetch } = useCalendarConnections(true);

  // Off server-side: nothing to offer, so nothing to draw.
  if (disabled) return null;

  if (google === undefined) {
    if (!isError) return null;
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg bg-grey-01 p-3">
        <Text as="p" variant="footnote" color="grey-04">
          We couldn’t load your calendar.
        </Text>
        <button type="button" onClick={() => refetch()} className={SECONDARY_BUTTON}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Google Calendar" className="flex shrink-0 flex-col gap-2">
      {google ? <ConnectedCalendar connection={google} /> : <ConnectCalendar />}
    </section>
  );
}

/** Sends the browser to Google; geo-chat sends it back here with `?calendar=…`. */
function useConnect() {
  const connect = useConnectGoogleCalendar();
  const start = () =>
    connect.mutate(window.location.href, {
      onSuccess: ({ authorization_url }) => window.location.assign(authorization_url),
    });
  // Still pending while the browser leaves, so the button stays disabled.
  return { start, pending: connect.isPending || connect.isSuccess, error: connect.isError ? connect.error : null };
}

function ConnectCalendar() {
  const connect = useConnect();

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-grey-01 p-3">
      <div className="flex items-center justify-between gap-3">
        <Text as="p" variant="footnote">
          Block out times you’re busy on Google Calendar. Geo only sees when you’re busy, never your events.
        </Text>
        <button type="button" onClick={connect.start} disabled={connect.pending} className={PRIMARY_BUTTON}>
          {connect.pending ? 'Opening Google…' : 'Connect Google Calendar'}
        </button>
      </div>
      {connect.error ? (
        <p role="alert" className="text-footnote text-red-01">
          {requestErrorCopy(connect.error)}
        </p>
      ) : null}
    </div>
  );
}

function ConnectedCalendar({ connection }: { connection: GoogleCalendarConnection }) {
  const connect = useConnect();
  const refresh = useRefreshGoogleCalendar();
  const disconnect = useDisconnectGoogleCalendar();
  const [confirmingDisconnect, setConfirmingDisconnect] = React.useState(false);
  const needsReconnect = connection.status === 'needs_reconnect';
  const requestError = connect.error ?? (refresh.isError ? refresh.error : null);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-grey-01 p-3" data-calendar-status={connection.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text as="p" variant="metadataMedium">
            Google Calendar
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
              <button type="button" onClick={connect.start} disabled={connect.pending} className={PRIMARY_BUTTON}>
                {connect.pending ? 'Opening Google…' : 'Reconnect'}
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

      {connection.status === 'ok' ? null : (
        <Text as="p" variant="footnote" className="text-red-01">
          {connectionErrorCopy(connection.last_error)}
        </Text>
      )}
      <Text as="p" variant="footnote" color="grey-04">
        {syncedAgo(connection.last_success_at)}
      </Text>

      {connection.stale && !needsReconnect ? (
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
          <Text as="p" variant="footnote">
            Geo stops reading your calendar right away and gives up its access to it.
          </Text>
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
