'use client';

import { GeoChatRequestError, dashlessId } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { sameId } from '~/core/debates/rooms/room-presence';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useQueuedAction } from '~/core/state/pending-actions';

import { useCallReminder, useCallSeriesReminder } from './hooks';

export type ReminderScope = 'call' | 'series';

/** One queued reminder at a time, its target as the intent: `call:{callId}` or `series:{seriesId}`. */
const QUEUED_CALL_REMINDER_ID = 'call-reminder';

export function reminderIntent(scope: ReminderScope, id: string) {
  return `${scope}:${dashlessId(id)}`;
}

export function parseReminderIntent(intent: string | undefined): { scope: ReminderScope; id: string } | null {
  const [scope, id] = intent?.split(':') ?? [];
  return (scope === 'call' || scope === 'series') && id ? { scope, id } : null;
}

/**
 * Remind me on a scheduled call (GEO-3420): this call and its series, set independently. Signed out,
 * the press is queued and set after sign-in by whichever copy is mounted.
 */
export function useCallRemindPress({
  spaceId,
  callId,
  seriesId,
  call,
  series,
}: {
  spaceId: string;
  callId: string;
  seriesId: string | null;
  call: boolean;
  series: boolean;
}) {
  const { authenticated } = useGeoChatAuth();
  const callReminder = useCallReminder(spaceId);
  const seriesReminder = useCallSeriesReminder(spaceId);
  const signIn = usePrivySignIn();
  const { mutateAsync: setCall } = callReminder;
  const { mutateAsync: setSeries } = seriesReminder;

  const { queue, cancel, intent } = useQueuedAction({
    id: QUEUED_CALL_REMINDER_ID,
    component: 'debate_room',
    label: 'your call reminder',
    requires: 'auth',
    ready: authenticated,
    run: async (next, { isCurrent }) => {
      const target = parseReminderIntent(next);
      if (!target || !isCurrent()) return;
      try {
        if (target.scope === 'call') await setCall({ callId: target.id, remind: true });
        else await setSeries({ seriesId: target.id, remind: true });
      } catch (error) {
        // Opened or closed since: the page swaps in Join or the closed card.
        if (error instanceof GeoChatRequestError && error.status === 409) return;
        throw error;
      }
    },
  });

  const queued = parseReminderIntent(intent);
  const queuedHere = (scope: ReminderScope, id: string | null) =>
    queued !== null && id !== null && queued.scope === scope && sameId(queued.id, id);
  const reminded = {
    call: call || queuedHere('call', callId),
    series: series || queuedHere('series', seriesId),
  };
  const pending = callReminder.isPending || seriesReminder.isPending;
  const error = callReminder.error ?? seriesReminder.error ?? null;

  const toggle = (scope: ReminderScope, remind: boolean) => {
    const id = scope === 'call' ? callId : seriesId;
    if (!id || pending) return;
    if (!authenticated) {
      if (!remind) {
        if (queuedHere(scope, id)) cancel();
        return;
      }
      queue(reminderIntent(scope, id));
      signIn(
        {
          component: 'debate_room',
          target_type: scope === 'call' ? 'space_call' : 'space_call_series',
          target_id: dashlessId(id),
          auth_control: 'remind_call',
          auth_intent: 'remind_call',
          auth_continuation: 'queued',
        },
        { onCancel: cancel }
      );
      return;
    }
    if (scope === 'call') callReminder.mutate({ callId: id, remind });
    else seriesReminder.mutate({ seriesId: id, remind });
  };

  return { reminded, pending, error, toggle };
}
