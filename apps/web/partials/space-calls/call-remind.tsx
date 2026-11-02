'use client';

import * as React from 'react';

import { lobbyErrorMessage } from '~/core/debates/lobbies/lobby-format';
import { useCallRemindPress } from '~/core/space-calls/series/call-remind-press';

import { Text } from '~/design-system/text';

import { CallRemindControl } from './call-remind-control';

export const CALL_REMIND_FAILED = 'Could not save your reminder. Try again.';

/** Remind me for one scheduled call, signed in or out, with its failure beneath (GEO-3420). */
export function CallRemind({
  spaceId,
  callId,
  seriesId,
  call,
  series,
  analyticsLabel,
}: {
  spaceId: string;
  callId: string;
  seriesId: string | null;
  call: boolean;
  series: boolean;
  analyticsLabel?: string;
}) {
  const press = useCallRemindPress({ spaceId, callId, seriesId, call, series });
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <CallRemindControl
        reminded={press.reminded}
        hasSeries={seriesId !== null}
        pending={press.pending}
        onToggle={press.toggle}
        analyticsLabel={analyticsLabel}
      />
      {press.error ? (
        <Text as="p" variant="footnote" color="red-01" className="text-right">
          {lobbyErrorMessage(press.error, CALL_REMIND_FAILED, 'call')}
        </Text>
      ) : null}
    </div>
  );
}
