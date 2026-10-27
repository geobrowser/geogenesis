import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./analytics', () => ({ capture }));

type Attempts = typeof import('./auth-attempt');
type Tab = Awaited<ReturnType<typeof newTab>>;

// Each document has its own module state and session storage, but shares local storage.
// Duplicating a tab copies session storage once; subsequent writes remain independent.
async function newTab(copy?: { session: Map<string, string> }) {
  vi.resetModules();
  const api = await import('./auth-attempt');
  const session = new Map(copy?.session);
  return {
    session,
    run<T>(action: (attempts: Attempts) => T): T {
      const previous = globalThis.sessionStorage;
      vi.stubGlobal('sessionStorage', {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      });
      try {
        return action(api);
      } finally {
        vi.stubGlobal('sessionStorage', previous);
      }
    },
  };
}

const entry = {
  component: 'entity_vote_buttons',
  auth_control: 'upvote',
  auth_trigger: 'control',
  auth_intent: 'vote',
  auth_continuation: 'queued',
  target_type: 'entity',
  target_id: 'claim-1',
};
let original: Tab;
let attemptId: string;

beforeEach(async () => {
  localStorage.clear();
  capture.mockClear();
  original = await newTab();
  attemptId = original.run(api => api.beginAuthAttempt(entry).id);
});

function expectOriginalActive() {
  expect(original.run(api => api.currentAuthAttempt())).toMatchObject({ id: attemptId });
  expect(original.run(api => api.currentAuthAttempt()?.outcome)).toBeUndefined();
  expect(capture).not.toHaveBeenCalledWith(
    'auth_action_completed',
    expect.objectContaining({ auth_attempt_id: attemptId, outcome: 'cancelled' })
  );
}

describe('auth attempts across documents', () => {
  it('keeps the original queued intent when a cloned tab starts an independent login', async () => {
    const clone = await newTab(original);
    const next = clone.run(api => api.beginAuthAttempt({ ...entry, auth_control: 'downvote' }));
    expect(next.id).not.toBe(attemptId);
    expectOriginalActive();
    original.run(api => api.finishAuthAttempt('signed_up'));
    expect(original.run(api => api.authAttemptForAction('vote', 'claim-1', attemptId)?.id)).toBe(attemptId);
    expect(clone.run(api => api.currentAuthAttempt()?.id)).toBe(next.id);
  });

  it.each(['closed', 'superseded'] as const)('does not mark an inherited pointer %s', async outcome => {
    const clone = await newTab(original);
    clone.run(api => api.finishAuthAttempt(outcome));
    expectOriginalActive();
  });

  it('does not grant cancellation ownership when looking up a cross-tab recovery candidate', async () => {
    const other = await newTab();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    try {
      expect(other.run(api => api.currentAuthAttempt(true)?.id)).toBe(attemptId);
      expect(writes).not.toHaveBeenCalled();
    } finally {
      writes.mockRestore();
    }
    other.run(api => api.finishAuthAttempt('closed'));
    expectOriginalActive();
  });

  it.each([
    { name: 'modal', properties: undefined },
    {
      name: 'headless email',
      properties: { ...entry, component: 'explore_email_capture', auth_control: 'create_account' },
    },
  ])('records a separate $name prompt in a cloned document', async ({ properties }) => {
    const clone = await newTab(original);
    clone.run(api => api.openAuthAttempt(properties));
    const own = clone.run(api => api.currentAuthAttempt());
    expect(own?.id).not.toBe(attemptId);
    expect(own?.openedAt).toEqual(expect.any(Number));
    expect(own?.properties.auth_trigger).toBe(properties ? 'control' : 'redirect');
    expect(own?.properties.component).toBe(properties?.component ?? 'unknown');
    clone.run(api => api.finishAuthAttempt('closed'));
    expectOriginalActive();
    expect(original.run(api => api.currentAuthAttempt()?.openedAt)).toBeUndefined();
  });

  it('still supersedes an earlier press in the same document', () => {
    original.run(api => api.beginAuthAttempt(entry));
    expect(original.run(api => api.readAuthAttempt(attemptId)?.outcome)).toBe('superseded');
  });

  it.each(['copied pointer', 'unambiguous recovery'] as const)('retains OAuth completion with %s', async mode => {
    original.run(api => api.openAuthAttempt());
    const returning = await newTab(mode === 'copied pointer' ? original : undefined);
    returning.run(api => {
      const recovered = api.currentAuthAttempt(true);
      expect(recovered?.id).toBe(attemptId);
      api.finishAuthAttempt('signed_in', recovered);
      expect(api.currentAuthAttempt()?.id).toBe(attemptId);
      api.trackAuthOnboarding('start', 'viewed');
    });
    expect(original.run(api => api.currentAuthAttempt()?.outcome)).toBe('signed_in');
    expect(capture).toHaveBeenCalledWith(
      'auth_onboarding_progress',
      expect.objectContaining({ auth_attempt_id: attemptId })
    );
  });
});
