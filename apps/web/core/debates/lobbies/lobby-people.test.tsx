import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openProfile: vi.fn(), hookArgs: [] as unknown[][] }));

vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({
  useOpenDebaterProfile: (...args: unknown[]) => {
    mocks.hookArgs.push(args);
    return mocks.openProfile;
  },
}));

const { LobbyPersonName } = await import('./lobby-people');

afterEach(() => {
  cleanup();
  mocks.openProfile.mockReset();
  mocks.hookArgs.length = 0;
});

describe('LobbyPersonName', () => {
  it('is a button that opens the profile in the side panel, not a link away from the lobby', () => {
    render(
      <LobbyPersonName person={{ profile_space_id: 'space-a' }} interactionSurface="lobby_roster">
        Adam
      </LobbyPersonName>
    );

    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Adam' }));

    expect(mocks.openProfile).toHaveBeenCalledOnce();
    expect(mocks.hookArgs[0]).toEqual(['space-a', { interactionSurface: 'lobby_roster', lazy: true }]);
  });
});
