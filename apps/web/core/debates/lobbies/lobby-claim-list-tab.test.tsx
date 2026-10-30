import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import type { ClaimListPage } from '../claim-list-pages';
import { HUB_SCROLL_SELECTOR, HubScrollSelectorProvider } from '../matchmaking/hub-scroll';
import { TODAYS_CLAIMS_LIST_ID } from '../todays-claims/todays-claims-list-id';
import { LobbyClaimListTab, useClaimListName } from './lobby-claim-list-tab';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  page: { data: undefined as ClaimListPage | null | undefined, isLoading: false, error: null as Error | null },
  remove: vi.fn(),
  removeState: { isPending: false, error: null as Error | null },
  batches: [] as string[][],
  groups: undefined as unknown,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../claim-list-pages', async importOriginal => ({
  ...(await importOriginal<typeof import('../claim-list-pages')>()),
  useClaimListPage: () => ({ ...mocks.page, refetch: vi.fn() }),
}));
vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: true, accountKey: 'acct' }),
  useDebateClaimsBySpaces: (groups: unknown) => {
    mocks.groups = groups;
    return { claims: [], unresolvedSpaceIds: new Set() };
  },
}));
vi.mock('../use-debate-publishable-spaces', async importOriginal => ({
  ...(await importOriginal<typeof import('../use-debate-publishable-spaces')>()),
  useDebatePublishableSpaces: () => ({ publishableSpaceIds: null, isLoading: false }),
}));
vi.mock('./lobby-explore-claims-hooks', () => ({
  exploreRoomClaimBatches: (entries: { claim: { claim_entity_id: string } }[]) => [
    entries.map(entry => entry.claim.claim_entity_id),
  ],
}));
vi.mock('./lobby-explore-claims', () => ({
  useLobbyRoomCardRenderer: (_lobby: unknown, batches: string[][]) => {
    mocks.batches = batches;
    return (entry: { claim: { claim: string } }) => <article>{entry.claim.claim}</article>;
  },
}));
vi.mock('./lobby-claim-lists-hooks', () => ({
  useRemoveLobbyClaimList: () => ({ mutate: mocks.remove, ...mocks.removeState }),
}));

const SPACE = '3be38bb922bc80c6a6503fbbba28d2b0';
const OTHER_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const list = {
  entity_id: 'e2b27e141d5fc64c4a7d24dab8f23f69',
  space_id: SPACE,
  position: 0,
  added_by: { user_id: 'u1', profile_space_id: 'p1', display_name: 'Maya', avatar_cid: null },
  added_at: '2026-10-13T12:00:00Z',
};
const lobbyFor = (hosting: boolean) =>
  ({ lobby_id: 'lobby-1', viewer: { kind: 'member', hosting } }) as unknown as LobbyPageView;

afterEach(() => {
  cleanup();
  mocks.page = { data: undefined, isLoading: false, error: null };
  mocks.remove.mockClear();
  mocks.removeState = { isPending: false, error: null };
});

describe('LobbyClaimListTab', () => {
  it('draws each theme as a section of cards, with who added it and a link to the page', () => {
    mocks.page.data = {
      entityId: list.entity_id,
      spaceId: SPACE,
      name: 'AI highlights',
      sections: [
        {
          id: 'work',
          name: 'Work',
          claims: [
            {
              id: 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1',
              name: 'AI will create more jobs',
              description: null,
              tagSpaceIds: [OTHER_SPACE],
            },
          ],
        },
        {
          id: 'privacy',
          name: 'Privacy',
          claims: [
            {
              id: 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2',
              name: 'No training on private chats',
              description: null,
              tagSpaceIds: [OTHER_SPACE],
            },
            {
              id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
              name: 'Warrants for AI analysis',
              description: null,
              tagSpaceIds: [OTHER_SPACE],
            },
          ],
        },
      ],
    };
    render(<LobbyClaimListTab lobby={lobbyFor(false)} list={list} />);

    expect(screen.getByText('Added by Maya · 2 themes')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the full page' }).getAttribute('href')).toContain(list.entity_id);
    expect(screen.getByRole('region', { name: 'Privacy' }).textContent).toContain('2 claims');
    expect(screen.getAllByRole('article').map(card => card.textContent)).toEqual([
      'AI will create more jobs',
      'No training on private chats',
      'Warrants for AI analysis',
    ]);
    // geo-chat is asked in the space each claim is debated in, not the curator page's.
    expect(mocks.groups).toEqual([
      {
        spaceId: OTHER_SPACE,
        claimIds: [
          'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1',
          'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2',
          'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
        ],
      },
    ]);
    // Room sides are batched over every card, in page order, and read as they near the viewport.
    expect(mocks.batches).toEqual([
      ['c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1', 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2', 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3'],
    ]);

    // No scroll box of its own (phones): the theme scrolls the page, which is what scrolls there.
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Themes' })).getByRole('button', { name: 'Privacy' })
    );
    expect(windowScroll).toHaveBeenCalledTimes(1);
    windowScroll.mockRestore();
  });

  it('scrolls only the claims column to a theme, never the page around it', () => {
    mocks.page.data = {
      entityId: list.entity_id,
      spaceId: SPACE,
      name: 'AI highlights',
      sections: [
        {
          id: 'work',
          name: 'Work',
          claims: [{ id: 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1', name: 'One', description: null, tagSpaceIds: [SPACE] }],
        },
        {
          id: 'privacy',
          name: 'Privacy',
          claims: [{ id: 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2', name: 'Two', description: null, tagSpaceIds: [SPACE] }],
        },
      ],
    };
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <div data-debates-hub-scroll="" data-testid="column">
        <HubScrollSelectorProvider value={HUB_SCROLL_SELECTOR}>
          <LobbyClaimListTab lobby={lobbyFor(false)} list={list} />
        </HubScrollSelectorProvider>
      </div>
    );
    const column = screen.getByTestId('column');
    column.scrollTo = vi.fn();

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Themes' })).getByRole('button', { name: 'Privacy' })
    );
    expect(column.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(windowScroll).not.toHaveBeenCalled();
    windowScroll.mockRestore();
  });

  it('says a deleted page is gone, and lets only a host remove it', async () => {
    mocks.page.data = null;
    const { rerender } = render(<LobbyClaimListTab lobby={lobbyFor(false)} list={list} />);
    expect(screen.getByText('This list is no longer available.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove from lobby' })).toBeNull();

    rerender(<LobbyClaimListTab lobby={lobbyFor(true)} list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from lobby' }));
    expect(mocks.remove).toHaveBeenCalledWith(list.entity_id);
  });

  it('says why removing a deleted page failed, and does not send it twice', async () => {
    mocks.page.data = null;
    mocks.removeState = { isPending: false, error: new GeoChatRequestError('nope', 'lobby_host_required', 403) };
    const { rerender } = render(<LobbyClaimListTab lobby={lobbyFor(true)} list={list} />);
    expect(await screen.findByText('Only a host can do that.')).toBeTruthy();

    mocks.removeState = { isPending: true, error: null };
    rerender(<LobbyClaimListTab lobby={lobbyFor(true)} list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Removing…' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('offers a retry when the page cannot be read', () => {
    mocks.page.error = new Error('boom');
    render(<LobbyClaimListTab lobby={lobbyFor(false)} list={list} />);
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('useClaimListName', () => {
  it('names Today’s claims itself, with no page to read', () => {
    const { result } = renderHook(() =>
      useClaimListName({ entity_id: TODAYS_CLAIMS_LIST_ID, space_id: TODAYS_CLAIMS_LIST_ID })
    );
    expect(result.current).toBe('Today’s claims');
  });
});
