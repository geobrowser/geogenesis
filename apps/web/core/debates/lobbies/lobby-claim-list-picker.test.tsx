import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimListCatalog } from '../claim-list-pages';
import type { TodaysListSection } from '../todays-claims/todays-claims-list';
import { TODAYS_CLAIMS_LIST_ID } from '../todays-claims/todays-claims-list-id';
import { ClaimListPicker, ClaimListPickerContent, LobbyClaimListPicker } from './lobby-claim-list-picker';

const mocks = vi.hoisted(() => ({
  catalog: {
    data: undefined as ClaimListCatalog | undefined,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  todays: { sections: [] as TodaysListSection[], isLoading: false, error: null as Error | null },
}));

vi.mock('../claim-list-pages', async importOriginal => ({
  ...(await importOriginal<typeof import('../claim-list-pages')>()),
  useClaimListCatalog: () => mocks.catalog,
}));
vi.mock('../todays-claims/todays-claims-list', async importOriginal => ({
  ...(await importOriginal<typeof import('../todays-claims/todays-claims-list')>()),
  useTodaysClaimsList: () => mocks.todays,
}));
vi.mock('../use-debate-publishable-spaces', async importOriginal => ({
  ...(await importOriginal<typeof import('../use-debate-publishable-spaces')>()),
  useDebatePublishableSpaces: () => ({ publishableSpaceIds: null, isLoading: false }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: (_labels: unknown, spaceId: string) => ({ name: SPACE_NAMES[spaceId] }),
}));
vi.mock('./lobby-claim-lists-hooks', () => ({
  useSaveLobbyClaimList: () => ({ mutate: mocks.mutate, isPending: false, error: null }),
}));

const CURATORS = '3be38bb922bc80c6a6503fbbba28d2b0';
const POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const catalog: ClaimListCatalog = {
  options: [
    { entityId: 'p-spicy', spaceId: CURATORS, name: 'Spicy debates', themes: themesOf(18, 60) },
    { entityId: 'p-ai', spaceId: CURATORS, name: 'AI highlights', themes: themesOf(15, 79) },
    { entityId: 'p-politics', spaceId: POLITICS, name: 'U.S. politics highlights', themes: themesOf(19, 89) },
  ],
  scores: new Map([
    [CURATORS, 0.08],
    [POLITICS, 0.8],
  ]),
};
/** `themes` themes holding `claims` claims between them, each tagged where it can be debated. */
function themesOf(themes: number, claims: number) {
  return Array.from({ length: themes }, (_, theme) =>
    Array.from({ length: Math.floor(claims / themes) + (theme < claims % themes ? 1 : 0) }, (_, index) => ({
      id: `claim-${theme}-${index}`,
      tagSpaceIds: ['41e851610e13a19441c4d980f2f2ce6b'],
    }))
  );
}
const SPACE_NAMES: Record<string, string> = { [CURATORS]: 'Geo Curator Program', [POLITICS]: 'US Politics' };

const added = (entityId: string) => ({
  entity_id: entityId,
  space_id: CURATORS,
  position: 0,
  added_by: null,
  added_at: '2026-10-13T12:00:00Z',
});

afterEach(() => {
  cleanup();
  mocks.catalog = { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
  mocks.mutate.mockClear();
  mocks.todays = { sections: [], isLoading: false, error: null };
  vi.unstubAllGlobals();
});

describe('ClaimListPickerContent', () => {
  it('lists pages under their space, ranked spaces first and pages A to Z, and marks the ones added', () => {
    mocks.catalog.data = catalog;
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[added('p-ai')]} onAdded={vi.fn()} />);

    const spaces = screen.getAllByRole('region').map(region => region.getAttribute('aria-label'));
    expect(spaces).toEqual(['US Politics', 'Geo Curator Program']);
    expect(screen.getByText('19 themes · 89 claims')).toBeTruthy();
    expect(screen.getAllByRole('button').map(button => button.textContent?.split(/\d/)[0])).toEqual([
      'U.S. politics highlights',
      'AI highlights',
      'Spicy debates',
    ]);
    const ai = screen.getByRole('button', { name: /AI highlights/ });
    expect(ai.textContent).toContain('Added');
    expect((ai as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds the picked page from the space it is listed under', () => {
    mocks.catalog.data = catalog;
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

  it('searches by name, keeping the grouping', async () => {
    mocks.catalog.data = catalog;
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'spicy' } });
    expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual([
      'Geo Curator Program',
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'zzz' } });
    expect(await screen.findByText('No claim lists match “zzz”.')).toBeTruthy();
  });

  it('explains an empty catalog', async () => {
    mocks.catalog.data = { options: [], scores: new Map() };
    render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);
    expect(await screen.findByText(/No claim lists yet/)).toBeTruthy();
  });

  // The full "+" is disabled, so on a phone a press is the only way to read why.
  it('explains a full lobby on a touch press of the disabled +', async () => {
    // jsdom has none; Radix sizes the open tooltip with it.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const full = ['a', 'b', 'c', 'd', 'e'].map(added);
    render(<LobbyClaimListPicker lobbyId="lobby-1" lists={full} onAdded={vi.fn()} />);
    const plus = screen.getByRole('button', { name: 'Remove a list to add another' });

    const press = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(press, { pointerType: 'touch', pointerId: 1, button: 0 });
    plus.dispatchEvent(press);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Remove a list to add another');
  });

  // On desktop the picker renders in place, so in the Open a debate lobby dialog its search sits
  // inside the dialog's form: Enter there must search, not open the lobby (GEO-3275).
  it('never submits a form it sits in when Enter is pressed in its search', async () => {
    mocks.catalog.data = catalog;
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <input aria-label="Name" />
        <ClaimListPicker addedIds={[]} analyticsLabel="Test pick" onPick={vi.fn()} />
        <button type="submit">Open lobby</button>
      </form>
    );
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox', { name: 'Search claim lists' }), 'spicy{Enter}');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Search claim lists' })).toHaveValue('spicy');

    // The harness does submit on Enter in an ordinary field, so the line above is not vacuous.
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'AI night{Enter}');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  describe('Today’s claims (GEO-3491)', () => {
    const todaysSection = (spaceId: string, claims: number): TodaysListSection => ({
      key: `todays:${spaceId}`,
      sectionId: `block-${spaceId}`,
      name: 'Brazil',
      claims: Array.from({ length: claims }, (_, index) => ({
        id: `c-${spaceId}-${index}`,
        name: 'A claim',
        description: null,
        spaceId,
        topics: [],
        scope: { agenda_id: 'agenda' },
      })),
    });

    it('pins Today’s claims above the spaces’ lists, counted as its tab draws it', () => {
      mocks.catalog.data = catalog;
      mocks.todays.sections = [todaysSection(CURATORS, 3), todaysSection(POLITICS, 11)];
      render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Today’s claims');
      expect(buttons[0]).toHaveTextContent('2 spaces · 14 claims');
      expect(buttons[1]).toHaveTextContent('U.S. politics highlights');
    });

    it('adds it under its own id, and marks it added once it is', () => {
      mocks.catalog.data = catalog;
      mocks.todays.sections = [todaysSection(CURATORS, 3)];
      const onAdded = vi.fn();
      const { rerender } = render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={onAdded} />);

      fireEvent.click(screen.getByRole('button', { name: /Today’s claims/ }));
      expect(mocks.mutate).toHaveBeenCalledWith(
        { entityId: TODAYS_CLAIMS_LIST_ID, spaceId: TODAYS_CLAIMS_LIST_ID },
        expect.anything()
      );
      mocks.mutate.mock.calls[0]![1].onSuccess();
      expect(onAdded).toHaveBeenCalledWith(TODAYS_CLAIMS_LIST_ID);

      rerender(<ClaimListPickerContent lobbyId="lobby-1" lists={[added(TODAYS_CLAIMS_LIST_ID)]} onAdded={onAdded} />);
      const todays = screen.getByRole('button', { name: /Today’s claims/ });
      expect(todays).toHaveTextContent('Added');
      expect(todays).toBeDisabled();
    });

    it('is left out when no agenda lists a claim, or a search does not name it', () => {
      mocks.catalog.data = catalog;
      render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /Today’s claims/ })).toBeNull();
      cleanup();

      mocks.todays.sections = [todaysSection(CURATORS, 3)];
      render(<ClaimListPickerContent lobbyId="lobby-1" lists={[]} onAdded={vi.fn()} />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'spicy' } });
      expect(screen.queryByRole('button', { name: /Today’s claims/ })).toBeNull();
      fireEvent.change(screen.getByRole('textbox', { name: 'Search claim lists' }), { target: { value: 'today' } });
      expect(screen.getByRole('button', { name: /Today’s claims/ })).toBeTruthy();
    });
  });
});
