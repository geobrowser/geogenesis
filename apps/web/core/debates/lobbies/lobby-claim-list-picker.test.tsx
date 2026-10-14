import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimListSpaceGroup } from '../claim-list-pages';
import { ClaimListPickerContent } from './lobby-claim-list-picker';

const mocks = vi.hoisted(() => ({
  catalog: { data: undefined as ClaimListSpaceGroup[] | undefined, isLoading: false, error: null as Error | null },
  mutate: vi.fn(),
}));

vi.mock('../claim-list-pages', async importOriginal => ({
  ...(await importOriginal<typeof import('../claim-list-pages')>()),
  useClaimListCatalog: () => mocks.catalog,
}));
vi.mock('./lobby-claim-lists-hooks', () => ({
  useSaveLobbyClaimList: () => ({ mutate: mocks.mutate, isPending: false, error: null }),
}));

const CURATORS = '3be38bb922bc80c6a6503fbbba28d2b0';
const POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const groups: ClaimListSpaceGroup[] = [
  {
    spaceId: POLITICS,
    spaceName: 'US Politics',
    score: 0.8,
    options: [
      { entityId: 'p-politics', spaceId: POLITICS, name: 'U.S. politics highlights', themeCount: 19, claimCount: 89 },
    ],
  },
  {
    spaceId: CURATORS,
    spaceName: 'Geo Curator Program',
    score: 0.08,
    options: [
      { entityId: 'p-ai', spaceId: CURATORS, name: 'AI highlights', themeCount: 15, claimCount: 79 },
      { entityId: 'p-spicy', spaceId: CURATORS, name: 'Spicy debates', themeCount: 18, claimCount: 60 },
    ],
  },
];
const added = (entityId: string) => ({
  entity_id: entityId,
  space_id: CURATORS,
  position: 0,
  added_by: null,
  added_at: '2026-10-13T12:00:00Z',
});

afterEach(() => {
  cleanup();
  mocks.catalog = { data: undefined, isLoading: false, error: null };
  mocks.mutate.mockClear();
});

describe('ClaimListPickerContent', () => {
  it('lists pages under their space, with counts, and marks the ones already added', () => {
    mocks.catalog.data = groups;
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[added('p-ai')]} onAdded={vi.fn()} />);

    const spaces = screen.getAllByRole('region').map(region => region.getAttribute('aria-label'));
    expect(spaces).toEqual(['US Politics', 'Geo Curator Program']);
    expect(screen.getByText('19 themes · 89 claims')).toBeTruthy();
    const ai = screen.getByRole('button', { name: /AI highlights/ });
    expect(ai.textContent).toContain('Added');
    expect((ai as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds the picked page from the space it is listed under', () => {
    mocks.catalog.data = groups;
    const onAdded = vi.fn();
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={onAdded} />);

    fireEvent.click(screen.getByRole('button', { name: /U\.S\. politics highlights/ }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { entityId: 'p-politics', spaceId: POLITICS },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    mocks.mutate.mock.calls[0]![1].onSuccess();
    expect(onAdded).toHaveBeenCalledWith('p-politics');
  });

  it('searches by name, keeping the grouping', () => {
    mocks.catalog.data = groups;
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'spicy' } });
    expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual([
      'Geo Curator Program',
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No claim lists match “zzz”.')).toBeTruthy();
  });

  it('explains an empty catalog', () => {
    mocks.catalog.data = [];
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);
    expect(screen.getByText(/No claim lists yet/)).toBeTruthy();
  });
});
