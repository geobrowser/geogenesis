import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  spaces: new Map<string, { topicId: string; entity: { id: string } }>(),
  listeners: new Set<() => void>(),
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => true }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-space', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  };
  return {
    useSpace: (spaceId?: string) => {
      const space = useSyncExternalStore(subscribe, () => (spaceId ? (mocks.spaces.get(spaceId) ?? null) : null));
      return { space, isLoading: space === null };
    },
  };
});

const { LobbyPersonName } = await import('./lobby-people');
const { LobbyPopup } = await import('./lobby-popup');

function Menu() {
  const [open, setOpen] = React.useState(true);
  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      trigger={<button type="button">Daniel’s tile</button>}
      title="Daniel"
    >
      <LobbyPersonName person={{ profile_space_id: 'space-daniel' }} interactionSurface="lobby_person_menu">
        Daniel
      </LobbyPersonName>
    </LobbyPopup>
  );
}

afterEach(() => {
  cleanup();
  mocks.openSidePanel.mockReset();
  mocks.spaces.clear();
  mocks.listeners.clear();
});

describe('LobbyPersonName in a lobby popup', () => {
  it('keeps the menu open while the profile loads, then opens it and closes the menu', () => {
    render(<Menu />);

    fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument();

    act(() => {
      mocks.spaces.set('space-daniel', { topicId: 'topic-daniel', entity: { id: 'page-daniel' } });
      mocks.listeners.forEach(listener => listener());
    });

    expect(mocks.openSidePanel).toHaveBeenCalledWith('topic-daniel', 'space-daniel', false, {
      forceRequestedSpace: true,
    });
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('opens the profile and closes the menu on the click when the profile is already loaded', () => {
    mocks.spaces.set('space-daniel', { topicId: 'topic-daniel', entity: { id: 'page-daniel' } });
    render(<Menu />);

    fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });
});
