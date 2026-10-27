import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  view: undefined as object | undefined,
  purpose: null as unknown,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }) }));
vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ ready: true, authenticated: true }) }));
vi.mock('~/core/debates/lobbies/hooks', () => ({ useDebateLobby: () => ({ data: mocks.view }) }));
vi.mock('~/core/debates/lobbies/lobby-guest-hooks', () => ({ useDebateLobbyGuestView: () => ({ data: undefined }) }));
vi.mock('~/core/debates/lobbies/lobby-page', async () => {
  const { useLobbyRoomPurpose } = await import('~/core/debates/lobbies/lobby-purpose');
  return {
    DebateLobbyPage: ({ lobbyId }: { lobbyId: string }) => {
      mocks.purpose = useLobbyRoomPurpose();
      return <div>lobby page {lobbyId}</div>;
    },
  };
});

const { SpaceCallPage } = await import('./space-call-page');

afterEach(() => {
  cleanup();
  mocks.replace.mockReset();
  mocks.view = undefined;
  mocks.purpose = null;
});

describe('SpaceCallPage', () => {
  it('draws the lobby page as a call of this space', () => {
    mocks.view = { purpose: 'call', call: { space_id: 'space1', space_name: 'Crypto', started_by: null } };
    render(<SpaceCallPage spaceId="space1" callId="call1" />);

    expect(screen.getByText('lobby page call1')).toBeInTheDocument();
    expect(mocks.purpose).toEqual({ purpose: 'call', spaceId: 'space1', exitHref: '/space/space1' });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('opens while the view loads', () => {
    render(<SpaceCallPage spaceId="space1" callId="call1" />);
    expect(screen.getByText('lobby page call1')).toBeInTheDocument();
  });

  it('sends a lobby to its own page without drawing it as a call', () => {
    mocks.view = { purpose: 'lobby', call: null };
    render(<SpaceCallPage spaceId="space1" callId="lobby1" />);

    expect(screen.queryByText('lobby page lobby1')).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/debate/lobby1');
  });

  it('sends a call under the wrong space to its own', () => {
    mocks.view = { purpose: 'call', call: { space_id: 'space2', space_name: null, started_by: null } };
    render(<SpaceCallPage spaceId="space1" callId="call1" />);
    expect(mocks.replace).toHaveBeenCalledWith('/space/space2/calls/call1');
  });
});
