import { DisconnectReason } from 'livekit-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportEvent } from '~/core/telemetry/logger';

import { reportCallDisconnect } from './disconnect-telemetry';

vi.mock('~/core/telemetry/logger', () => ({ reportEvent: vi.fn() }));

const CONTEXT = {
  spaceId: 'space-1',
  callId: 'call-1',
  roomName: 'space-1::call-1::1772130000000',
  occurrenceStart: 1772130000000,
  role: 'participant' as const,
  participantIdentity: 'participant-a',
};

afterEach(() => {
  vi.mocked(reportEvent).mockClear();
});

/** The tags of the single reported event, or null if nothing was reported. */
function reportedTags(): Record<string, unknown> | null {
  const calls = vi.mocked(reportEvent).mock.calls;
  if (calls.length === 0) return null;
  expect(calls).toHaveLength(1);
  return calls[0][0].tags ?? {};
}

/** The `extra` payload of the single reported event, or null if nothing was reported. */
function reportedExtra(): Record<string, unknown> | null {
  const calls = vi.mocked(reportEvent).mock.calls;
  if (calls.length === 0) return null;
  expect(calls).toHaveLength(1);
  return calls[0][0].extra ?? {};
}

describe('reportCallDisconnect', () => {
  /**
   * The overwhelmingly common disconnect is someone pressing Leave. Counting those as drops
   * would bury the handful that matter.
   */
  it('does not report a voluntary leave', () => {
    reportCallDisconnect(CONTEXT, { outcome: 'left', reason: DisconnectReason.CLIENT_INITIATED });
    expect(reportedTags()).toBeNull();
  });

  it('reports the scheduled cutoff even though it also arrives as a leave', () => {
    reportCallDisconnect(CONTEXT, {
      outcome: 'left',
      reason: DisconnectReason.CLIENT_INITIATED,
      endedByCutoff: true,
    });

    const tags = reportedTags();
    expect(tags).toMatchObject({ cause: 'scheduled', reason: 'SCHEDULED_CUTOFF', outcome: 'left' });
  });

  it('reports a drop that recovered on its own, with how long it took', () => {
    reportCallDisconnect(CONTEXT, {
      outcome: 'recovered',
      reason: DisconnectReason.SIGNAL_CLOSE,
      reconnectingMs: 4200,
      msSinceJoin: 90_000,
    });

    const call = vi.mocked(reportEvent).mock.calls[0][0];
    expect(call.tags).toMatchObject({ outcome: 'recovered', cause: 'unknown', reason: 'SIGNAL_CLOSE' });
    expect(call.extra).toMatchObject({ reconnectingMs: 4200, msSinceJoin: 90_000 });
  });

  /** The room is what lets several participants' episodes be correlated to one outage. */
  it('carries the room so simultaneous drops can be correlated', () => {
    reportCallDisconnect(CONTEXT, { outcome: 'gave_up', reason: DisconnectReason.MIGRATION });

    const call = vi.mocked(reportEvent).mock.calls[0][0];
    expect(call.extra).toMatchObject({ roomName: CONTEXT.roomName, occurrenceStart: CONTEXT.occurrenceStart });
    expect(call.tags).toMatchObject({ cause: 'server', outcome: 'gave_up' });
  });

  /** Grouping in Sentry is by message text, so the name must not vary per call. */
  it('uses one stable event name so events aggregate', () => {
    reportCallDisconnect(CONTEXT, { outcome: 'gave_up', reason: DisconnectReason.MIGRATION });
    reportCallDisconnect({ ...CONTEXT, callId: 'call-2' }, { outcome: 'recovered', reason: undefined });

    const names = vi.mocked(reportEvent).mock.calls.map(([event]) => event.name);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).not.toContain('call-1');
  });

  it('distinguishes viewers from participants', () => {
    reportCallDisconnect({ ...CONTEXT, role: 'viewer' }, { outcome: 'gave_up', reason: undefined });
    expect(reportedTags()).toMatchObject({ role: 'viewer', reason: 'NOT_REPORTED' });
  });
});

// Without these two, an episode says a drop happened but nothing about whose or how
// widespread — which is the only question the module was built to answer.
describe('drop attribution', () => {
  it("tags the participant so a room's episodes can be grouped by person", () => {
    reportCallDisconnect(CONTEXT, { outcome: 'recovered', reason: undefined });
    expect(reportedTags()).toMatchObject({ participantIdentity: 'participant-a' });
  });

  it('carries the room size the episode opened with', () => {
    reportCallDisconnect(CONTEXT, { outcome: 'gave_up', reason: undefined, participantCount: 7 });
    expect(reportedExtra()).toMatchObject({ participantCount: 7 });
  });
});
