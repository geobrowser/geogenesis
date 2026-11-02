import type { DebateRematchSession } from './api';

/** A browsing debate-again session, for tests: an hour-long browsing window, not a room's. */
export function rematchSessionFixture(overrides: Partial<DebateRematchSession> = {}): DebateRematchSession {
  return {
    id: 'session-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status: 'browsing',
    participants: [],
    decision_expires_at: '2026-09-24T17:00:00Z',
    browsing_expires_at: '2026-09-24T18:00:00Z',
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-09-24T17:00:00Z',
    updated_at: '2026-09-24T17:00:00Z',
    ...overrides,
  };
}

/**
 * One browser profile's Web Locks, shared by every "tab" in a test, for the shared holds that say a
 * picker is open (`holdOpenDebateTab`). A tab that closes has its locks dropped by the browser, which
 * is what calling a hold's release models. Install with `Object.defineProperty(navigator, 'locks')`.
 */
export class FakeLockManager {
  held: LockInfo[] = [];

  async request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) {
    const info: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'test' };
    this.held.push(info);
    try {
      await callback({ name, mode: info.mode! });
    } finally {
      this.held = this.held.filter(lock => lock !== info);
    }
  }

  async query(): Promise<LockManagerSnapshot> {
    return { held: [...this.held], pending: [] };
  }
}
