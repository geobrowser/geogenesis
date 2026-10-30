import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  going: vi.fn(),
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => true }));
vi.mock('./hooks', () => ({ useDebateLobbyGoing: mocks.going }));
vi.mock('./lobby-people', () => ({
  LobbyAvatarStack: () => null,
  LobbyPersonName: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

const { EVERYONE_GOING_COPY, LobbyGoing } = await import('./lobby-pre-open-details');

const person = (name: string) => ({
  user_id: `user-${name}`,
  profile_space_id: `space-${name}`,
  display_name: name,
  avatar_cid: null,
});

afterEach(() => {
  cleanup();
  mocks.going.mockReset();
});

describe('LobbyGoing for a host (GEO-3540)', () => {
  it('opens everyone going, past the names the summary shows', () => {
    const people = Array.from({ length: 23 }, (_, index) => person(`Person ${index}`));
    mocks.going.mockReturnValue({ data: { lobby_id: 'lobby-1', people, count: 23 }, isError: false });
    render(<LobbyGoing going={people.slice(0, 20)} count={23} hostOf="lobby-1" />);

    // Read only once opened.
    expect(mocks.going).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Person 0, Person 1 and 21 more going/ }));

    expect(mocks.going).toHaveBeenCalledWith('lobby-1');
    expect(screen.getAllByText(EVERYONE_GOING_COPY.title(23)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Person 22' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(23);
  });

  it('says so when the list fails to load', () => {
    mocks.going.mockReturnValue({ data: undefined, isError: true });
    render(<LobbyGoing going={[person('Ana')]} count={1} hostOf="lobby-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Ana going/ }));
    expect(screen.getByText(EVERYONE_GOING_COPY.failed)).toBeInTheDocument();
  });

  it('is a plain summary for everyone else', () => {
    render(<LobbyGoing going={[person('Ana')]} count={1} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ana going')).toBeInTheDocument();
    expect(mocks.going).not.toHaveBeenCalled();
  });
});
