import { describe, expect, it, vi } from 'vitest';

import { notifyScheduleChange } from './notify-schedule-change';

const OLD = 'DTSTART;TZID=Europe/Vilnius:20260821T170000\nDTEND;TZID=Europe/Vilnius:20260821T171500';
const NEW = 'DTSTART;TZID=Europe/Vilnius:20260821T220000\nDTEND;TZID=Europe/Vilnius:20260821T230000';

/** A clock that only moves when the code under test sleeps, so the tests don't. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function harness(
  overrides: Partial<Parameters<typeof notifyScheduleChange>[0]> & {
    schedules?: (string | null)[];
  } = {}
) {
  const { schedules, ...rest } = overrides;
  const clock = fakeClock();
  const notify = vi.fn().mockResolvedValue({ notified: 3 });
  const queue = [...(schedules ?? [NEW])];
  const readIndexedSchedule = vi.fn().mockImplementation(async () => (queue.length > 1 ? queue.shift()! : queue[0]));

  return {
    notify,
    readIndexedSchedule,
    run: () =>
      notifyScheduleChange({
        spaceId: 'space-1',
        callId: 'call-1',
        next: NEW,
        previous: OLD,
        getToken: async () => 'token',
        readIndexedSchedule,
        notify,
        sleep: clock.sleep,
        now: clock.now,
        timeoutMs: 10_000,
        pollMs: 3_000,
        ...rest,
      }),
  };
}

describe('notifyScheduleChange', () => {
  it('waits for the indexer to report the new schedule before notifying', async () => {
    // The whole point of GEO-2817: notifying while the indexer still has the old time mails
    // that old time with a bumped SEQUENCE, and nothing fires again to correct it.
    const h = harness({ schedules: [OLD, OLD, NEW] });

    await expect(h.run()).resolves.toEqual({ status: 'notified' });

    expect(h.readIndexedSchedule).toHaveBeenCalledTimes(3);
    expect(h.notify).toHaveBeenCalledExactlyOnceWith({ spaceId: 'space-1', callId: 'call-1' }, 'token');
  });

  it('does not notify at all when the indexer never catches up', async () => {
    // Deliberately worse-is-better: a missed resend leaves the old time and can be retried,
    // where a resend *of* the old time spends the sequence number a correct resend would need.
    const h = harness({ schedules: [OLD] });

    await expect(h.run()).resolves.toEqual({ status: 'timed-out', lastSeen: OLD });

    expect(h.notify).not.toHaveBeenCalled();
  });

  it('notifies immediately when the edit did not touch the time', async () => {
    // A rename still needs the invite resent — the title is in it — but there is nothing to
    // wait for, so it must not sit through the whole poll window.
    const h = harness({ previous: NEW, schedules: [OLD] });

    await expect(h.run()).resolves.toEqual({ status: 'notified' });

    expect(h.readIndexedSchedule).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('keeps polling through a failed read', async () => {
    const readIndexedSchedule = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(NEW);
    const h = harness({ readIndexedSchedule });

    await expect(h.run()).resolves.toEqual({ status: 'notified' });

    expect(readIndexedSchedule).toHaveBeenCalledTimes(2);
  });

  it('reports a missing identity token rather than silently doing nothing', async () => {
    const h = harness({ getToken: async () => null });

    await expect(h.run()).resolves.toEqual({ status: 'skipped-no-token' });

    expect(h.notify).not.toHaveBeenCalled();
  });

  it('reports a rejected notification', async () => {
    const error = new Error('curator-backend said no');
    const notify = vi.fn().mockRejectedValue(error);
    const h = harness({ notify });

    await expect(h.run()).resolves.toEqual({ status: 'failed', error });
  });
});
