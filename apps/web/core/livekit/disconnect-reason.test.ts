import { DisconnectReason } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import { disconnectCause, disconnectReasonName } from './disconnect-reason';

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
