import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentGeoChatUserId } from './use-current-geo-chat-user-id';

const mocks = vi.hoisted(() => ({
  stored: null as string | null,
  authenticated: true,
  accountKey: 'account-a' as string | null,
  resolve: vi.fn(),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  getCurrentGeoChatUserId: () => mocks.stored,
  resolveCurrentGeoChatUserId: (...args: unknown[]) => mocks.resolve(...args),
}));

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    accountKey: mocks.accountKey,
    getPrivyIdentityToken: vi.fn(),
  }),
}));

function Probe() {
  const userId = useCurrentGeoChatUserId();
  return <span data-testid="id">{userId ?? 'unknown'}</span>;
}

const readId = () => screen.getByTestId('id').textContent;

beforeEach(() => {
  mocks.stored = null;
  mocks.authenticated = true;
  mocks.accountKey = 'account-a';
  mocks.resolve.mockReset();
  mocks.resolve.mockResolvedValue('user-a');
});

afterEach(cleanup);

describe('useCurrentGeoChatUserId', () => {
  it('uses the stored session without a round trip', () => {
    mocks.stored = 'user-a';
    render(<Probe />);

    expect(readId()).toBe('user-a');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('resolves the id when the session has not been written yet', async () => {
    render(<Probe />);

    expect(readId()).toBe('unknown');
    await waitFor(() => expect(readId()).toBe('user-a'));
  });

  // Switching accounts clears the stored session, so a resolved id that isn't tied to the account
  // it came from would keep answering for the account the viewer just left — and the popup gating
  // that reads this would then be deciding against the wrong person.
  it('does not answer with the previous account id after a switch', async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(readId()).toBe('user-a'));

    // The new account has no stored session yet and its exchange has not settled.
    mocks.accountKey = 'account-b';
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    view.rerender(<Probe />);

    expect(readId()).toBe('unknown');
  });

  it('forgets a resolved id once the viewer signs out', async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(readId()).toBe('user-a'));

    mocks.authenticated = false;
    view.rerender(<Probe />);

    await waitFor(() => expect(readId()).toBe('unknown'));
  });

  it('lets the stored session take over from a resolved id', async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(readId()).toBe('user-a'));

    mocks.stored = 'user-stored';
    view.rerender(<Probe />);

    expect(readId()).toBe('user-stored');
  });
});
