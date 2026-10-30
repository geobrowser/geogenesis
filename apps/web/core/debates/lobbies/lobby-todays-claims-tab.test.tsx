import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TodaysListClaim, TodaysListSection } from '../todays-claims/todays-claims-list';
import { LobbyTodaysClaimsTab } from './lobby-todays-claims-tab';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  list: {
    sections: [] as TodaysListSection[],
    newestDay: '2026-10-30' as string | null,
    isLoading: false,
    error: null as Error | null,
  },
  listArgs: undefined as unknown,
  recorded: [] as unknown[][],
  surfaces: [] as { listId: string; position: number; scope: unknown }[],
}));

vi.mock('../todays-claims/todays-claims-list', () => ({
  useTodaysClaimsList: (args: unknown) => {
    mocks.listArgs = args;
    return mocks.list;
  },
}));
vi.mock('../todays-claims/section-open-state', () => ({
  useTodaysSectionsOpen: () => {
    const [open, setOpenState] = React.useState<Record<string, boolean>>({});
    return {
      isOpen: (key: string, fallback: boolean) => open[key] ?? fallback,
      setOpen: (key: string, next: boolean) => setOpenState(current => ({ ...current, [key]: next })),
    };
  },
}));
vi.mock('../debate-claim-card-surface', () => ({
  sectionStartOffsets: (counts: number[]) =>
    counts.map((_, index) => counts.slice(0, index).reduce((a, b) => a + b, 0)),
  useRecordClaimFilter:
    () =>
    (...args: unknown[]) =>
      mocks.recorded.push(args),
  DebateClaimCardSurface: ({
    listId,
    position,
    scope,
    children,
  }: {
    listId: string;
    position: number;
    scope: unknown;
    children: React.ReactNode;
  }) => {
    mocks.surfaces.push({ listId, position, scope });
    return <>{children}</>;
  },
}));
vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: true, accountKey: 'acct' }),
  useDebateClaimsBySpaces: () => ({ claims: [], unresolvedSpaceIds: new Set() }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: (_labels: unknown, spaceId: string) => ({ name: SPACE_NAMES[spaceId] }),
}));
vi.mock('./lobby-explore-claims-hooks', () => ({
  exploreRoomClaimBatches: () => [],
}));
vi.mock('./lobby-explore-claims', () => ({
  useLobbyRoomCardRenderer: () => (entry: { claim: { claim: string } }) => <article>{entry.claim.claim}</article>,
}));
// FacetFilterPills measures its row; jsdom has no layout, so every pill is drawn.
vi.mock('../matchmaking/facet-filter-pills', () => ({
  FacetFilterPills: ({
    options,
    pickedIds,
    onToggle,
  }: {
    options: { id: string; name: string | null; count: number }[];
    pickedIds: string[];
    onToggle: (option: unknown) => void;
  }) => (
    <div role="group" aria-label="Filters">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          aria-pressed={pickedIds.includes(option.id)}
          onClick={() => onToggle(option)}
        >{`${option.name} ${option.count}`}</button>
      ))}
    </div>
  ),
}));

const WORLD = 'a0000000000000000000000000000001';
const POLITICS = 'b0000000000000000000000000000002';
const SPACE_NAMES: Record<string, string> = { [WORLD]: 'World affairs', [POLITICS]: 'US Politics' };
const BRAZIL = { id: 'e0000000000000000000000000000001', name: 'Brazil' };
const AI = { id: 'e0000000000000000000000000000002', name: 'AI' };

const claim = (id: string, spaceId: string, topics: { id: string; name: string }[]): TodaysListClaim => ({
  id,
  name: `Claim ${id}`,
  description: null,
  spaceId,
  topics,
  scope: { agenda_id: `agenda-${spaceId}`, agenda_date: '2026-10-30', list_section_id: `block-${spaceId}` },
});
const sections: TodaysListSection[] = [
  {
    key: 'todays:world',
    sectionId: 'block-world',
    name: 'Lula’s comeback',
    claims: [claim('w1', WORLD, [BRAZIL]), claim('w2', WORLD, [BRAZIL, AI]), claim('w3', WORLD, [])],
  },
  { key: 'todays:politics', sectionId: 'block-politics', name: 'Midterms', claims: [claim('p1', POLITICS, [AI])] },
];

const lobby = {
  lobby_id: 'lobby-1',
  call: { space_id: WORLD },
  viewer: { kind: 'member', hosting: true },
} as unknown as LobbyPageView;

afterEach(() => {
  cleanup();
  mocks.list = { sections: [], newestDay: '2026-10-30', isLoading: false, error: null };
  mocks.recorded = [];
  mocks.surfaces = [];
});

describe('LobbyTodaysClaimsTab', () => {
  it('starts on the lobby’s space and draws each agenda section under its heading', () => {
    mocks.list.sections = sections;
    render(<LobbyTodaysClaimsTab lobby={lobby} />);

    expect(mocks.listArgs).toEqual({ leadSpaceId: WORLD });
    const headings = screen.getAllByRole('button', { expanded: true });
    expect(headings.map(heading => heading.textContent)).toEqual([
      expect.stringContaining('Lula’s comeback'),
      expect.stringContaining('Midterms'),
    ]);
    expect(screen.getAllByRole('article').map(card => card.textContent)).toEqual([
      'Claim w1',
      'Claim w2',
      'Claim w3',
      'Claim p1',
    ]);
    // No subtext row: no "Added by", no theme count, no link to a page.
    expect(screen.queryByText(/Added by/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    // GEO-3495: the lobby's own list id, numbered down the whole list, with the agenda's attribution.
    expect(mocks.surfaces.map(surface => [surface.listId, surface.position])).toEqual([
      ['todays_claims_lobby', 1],
      ['todays_claims_lobby', 2],
      ['todays_claims_lobby', 3],
      ['todays_claims_lobby', 4],
    ]);
    expect(mocks.surfaces[3]!.scope).toMatchObject({ agenda_id: `agenda-${POLITICS}` });
  });

  it('collapses and expands a section from its heading', () => {
    mocks.list.sections = sections;
    render(<LobbyTodaysClaimsTab lobby={lobby} />);

    fireEvent.click(screen.getByRole('button', { name: /Lula’s comeback/ }));
    expect(screen.getByRole('button', { name: /Lula’s comeback/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Claim w1')).toBeNull();
    expect(mocks.recorded.at(-1)).toEqual([
      'todays_claims_lobby',
      { kind: 'section', value: 'block-world', selected: false },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Lula’s comeback/ }));
    expect(screen.getByText('Claim w1')).toBeTruthy();
  });

  it('filters by space and topic pills together, each counted by what picking it leaves', () => {
    mocks.list.sections = sections;
    render(<LobbyTodaysClaimsTab lobby={lobby} />);
    const pills = () =>
      within(screen.getByRole('group', { name: 'Filters' }))
        .getAllByRole('button')
        .map(pill => pill.textContent);

    expect(pills()).toEqual(['World affairs 3', 'US Politics 1', 'Brazil 2', 'AI 2']);

    fireEvent.click(screen.getByRole('button', { name: 'AI 2' }));
    // AI is on one World affairs claim and one US Politics claim; Brazil now leaves one.
    expect(pills()).toEqual(['World affairs 1', 'US Politics 1', 'AI 2', 'Brazil 1']);
    expect(screen.getAllByRole('article').map(card => card.textContent)).toEqual(['Claim w2', 'Claim p1']);

    fireEvent.click(screen.getByRole('button', { name: 'US Politics 1' }));
    // AND: only the US Politics AI claim is left, so its section alone is drawn.
    expect(screen.getAllByRole('article').map(card => card.textContent)).toEqual(['Claim p1']);
    expect(screen.queryByRole('button', { name: /Lula’s comeback/ })).toBeNull();
    expect(mocks.recorded).toContainEqual(['todays_claims_lobby', { kind: 'space', value: POLITICS, selected: true }]);
  });

  it('says when no agenda lists anything yet', async () => {
    render(<LobbyTodaysClaimsTab lobby={lobby} />);
    expect(await screen.findByText('No agendas today yet.')).toBeTruthy();
  });
});
