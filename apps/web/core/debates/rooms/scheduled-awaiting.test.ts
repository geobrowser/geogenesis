import { describe, expect, it, vi } from 'vitest';

import type { ScheduledDebateRequest } from '../api';

vi.mock('~/core/state/feature-flags', () => ({ usePeerAvailabilityEnabled: () => true }));

const { isOpenScheduledRequest } = await import('./scheduled-awaiting');

const request = (overrides: Partial<ScheduledDebateRequest>) =>
  ({ status: 'pending', room_id: null, ...overrides }) as ScheduledDebateRequest;

describe('isOpenScheduledRequest', () => {
  it('is open while pending and unbooked, whoever it waits on', () => {
    expect(isOpenScheduledRequest(request({ viewer_must_answer: true }))).toBe(true);
    expect(isOpenScheduledRequest(request({ viewer_must_answer: false }))).toBe(true);
  });

  it('is closed once booked into a room or answered', () => {
    expect(isOpenScheduledRequest(request({ room_id: 'room-1' }))).toBe(false);
    expect(isOpenScheduledRequest(request({ status: 'accepted' }))).toBe(false);
  });
});
