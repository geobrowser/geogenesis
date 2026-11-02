import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  spaces: new Map<string, { topicId: string; entity: { id: string } }>(),
  listeners: new Set<() => void>(),
  /** Every space id a name has asked for. */
  asked: [] as string[],
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
      if (spaceId) mocks.asked.push(spaceId);
      const space = useSyncExternalStore(subscribe, () => (spaceId ? (mocks.spaces.get(spaceId) ?? null) : null));
      return { space, isLoading: space === null };
    },
  };
});

const { LobbyPersonName } = await import('./lobby-people');
const { LobbyPopup } = await import('./lobby-popup');

function Menu({ lazy }: { lazy?: boolean }) {
  const [open, setOpen] = React.useState(true);
  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      trigger={<button type="button">Daniel’s tile</button>}
      title="Daniel"
    >
      <LobbyPersonName person={{ profile_space_id: 'space-daniel' }} interactionSurface="lobby_person_menu" lazy={lazy}>
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
  mocks.asked = [];
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

  // GEO-3540 review: everyone going lists hundreds of names; none is read until it is clicked.
  it('reads a lazy name’s profile on the click, then still closes the menu once it opens', () => {
    render(<Menu lazy />);
    expect(mocks.asked).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
    expect(mocks.asked).toContain('space-daniel');
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument();

    act(() => {
      mocks.spaces.set('space-daniel', { topicId: 'topic-daniel', entity: { id: 'page-daniel' } });
      mocks.listeners.forEach(listener => listener());
    });
    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
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
