import { DisconnectReason } from 'livekit-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportEvent } from '~/core/telemetry/logger';

import { disconnectCause, disconnectReasonName, reportCallDisconnect } from './disconnect-telemetry';

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

describe('disconnectReasonName', () => {
  it('names each reason', () => {
    expect(disconnectReasonName(DisconnectReason.MIGRATION)).toBe('MIGRATION');
    expect(disconnectReasonName(DisconnectReason.SERVER_SHUTDOWN)).toBe('SERVER_SHUTDOWN');
  });

  /**
   * "LiveKit gave us no reason" and "LiveKit said UNKNOWN_REASON" point at different places,
   * so collapsing them into one label would lose the distinction.
   */
  it('distinguishes an absent reason from an explicitly unknown one', () => {
    expect(disconnectReasonName(undefined)).toBe('NOT_REPORTED');
    expect(disconnectReasonName(DisconnectReason.UNKNOWN_REASON)).toBe('UNKNOWN_REASON');
  });

  it('labels a reason added by a future livekit version rather than dropping it', () => {
    expect(disconnectReasonName(99 as DisconnectReason)).toBe('UNMAPPED_99');
  });
});

describe('disconnectCause', () => {
  it('attributes server-side lifecycle reasons to the server', () => {
    expect(disconnectCause(DisconnectReason.SERVER_SHUTDOWN)).toBe('server');
    expect(disconnectCause(DisconnectReason.MIGRATION)).toBe('server');
    expect(disconnectCause(DisconnectReason.STATE_MISMATCH)).toBe('server');
    expect(disconnectCause(DisconnectReason.JOIN_FAILURE)).toBe('server');
  });

  it('separates moderation from faults', () => {
    expect(disconnectCause(DisconnectReason.PARTICIPANT_REMOVED)).toBe('moderation');
    expect(disconnectCause(DisconnectReason.ROOM_DELETED)).toBe('moderation');
  });

  it('treats a voluntary leave as intentional', () => {
    expect(disconnectCause(DisconnectReason.CLIENT_INITIATED)).toBe('intentional');
  });

  /**
   * SIGNAL_CLOSE happens both when a participant's network drops and when something
   * upstream severs the socket. Guessing `client` would blame users for our own outages.
   */
  it('leaves the ambiguous signal-close unattributed', () => {
    expect(disconnectCause(DisconnectReason.SIGNAL_CLOSE)).toBe('unknown');
  });

  it('falls back to unknown for an unmapped reason', () => {
    expect(disconnectCause(undefined)).toBe('unknown');
    expect(disconnectCause(99 as DisconnectReason)).toBe('unknown');
  });
});

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
