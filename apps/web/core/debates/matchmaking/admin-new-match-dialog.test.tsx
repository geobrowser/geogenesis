import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debaters: [] as { user_id: string; timezone: string; block_count: number }[],
  summaries: [] as { user_id: string; profile_space_id: string; display_name: string; avatar_cid: null }[],
  searchQuery: '',
  searchResults: [] as { id: string }[],
  overlap: undefined as unknown,
  matchesByAnchor: {} as Record<string, [string, unknown[]][]>,
  matchesKnown: true,
  anchors: [] as (string | null | undefined)[],
  create: vi.fn(),
  prompt: vi.fn(),
}));

vi.mock('./admin-hooks', () => ({
  ADMIN_MATCH_DAYS: 14,
  useAdminDebaters: () => ({ data: mocks.debaters, isPending: false, timezoneByUser: new Map() }),
  useAdminPairOverlap: (first: string | null, second: string | null) =>
    first && second
      ? { data: mocks.overlap, isPending: mocks.overlap === undefined, error: null, refetch: vi.fn() }
      : { isPending: false },
  useCreateAdminMatch: () => ({ mutate: mocks.create, isPending: false, error: null }),
  useAdminAvailabilityPrompt: () => ({ mutateAsync: mocks.prompt }),
}));
vi.mock('~/core/hooks/use-search', () => ({
  useSearch: () => ({
    query: mocks.searchQuery,
    onQueryChange: (next: string) => {
      mocks.searchQuery = next;
    },
    results: mocks.searchResults,
    isLoading: false,
  }),
}));
vi.mock('./use-geo-chat-user-summaries', () => ({
  useGeoChatUserSummaries: (ids: string[]) => mocks.summaries.filter(summary => ids.includes(summary.user_id)),
}));
vi.mock('./use-person-facts', () => ({
  usePersonFacts: (_people: unknown, { anchorProfileSpaceId }: { anchorProfileSpaceId?: string | null }) => {
    mocks.anchors.push(anchorProfileSpaceId);
    return {
      matchesKnown: Boolean(anchorProfileSpaceId) && mocks.matchesKnown,
      matchAnalysis: {
        byProfile: new Map(anchorProfileSpaceId ? (mocks.matchesByAnchor[anchorProfileSpaceId] ?? []) : []),
      },
      records: new Map(),
      debateSpacesByPerson: new Map(),
      spaceActivityUnavailable: false,
      publishableSpacesPending: false,
      personRecordsPending: false,
    };
  },
}));
vi.mock('./space-filter-pills', () => ({ SpaceFilterPills: () => null }));
vi.mock('./use-space-filter-selection', () => ({
  useSpaceFilterMenu: () => ({ facetSpaces: [], onSpaceToggle: vi.fn(), onSpacesClear: vi.fn() }),
}));
vi.mock('./person-record-line', () => ({
  PersonRecordLine: ({ match }: { match?: React.ReactNode }) => <>{match}</>,
}));
vi.mock('~/partials/availability/peer-availability', () => ({
  MUTUAL_SLOT: 'mutual',
  SELECTED_SLOT: 'selected',
}));

const { AdminNewMatchDialog } = await import('./admin-new-match-dialog');

// Tuesday 6 Oct 2026, 9:20 local.
const NOW = new Date(2026, 9, 6, 9, 20);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const person = (id: string, name: string) => ({
  user_id: id,
  profile_space_id: `space${id}`,
  display_name: name,
  avatar_cid: null,
});
const match = (n: number) => Array.from({ length: n }, (_, index) => ({ claimId: `claim-${index}` }));

function renderDialog(onSent = vi.fn()) {
  const view = render(<AdminNewMatchDialog open onOpenChange={vi.fn()} onSent={onSent} />);
  return { ...view, onSent };
}

const people = () => screen.getAllByRole('listitem').filter(item => item.closest('[aria-label="People"]'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(mocks, {
    debaters: [
      { user_id: 'ana', timezone: 'Europe/Madrid', block_count: 3 },
      { user_id: 'raj', timezone: 'Asia/Kolkata', block_count: 2 },
      { user_id: 'leo', timezone: 'Africa/Lagos', block_count: 4 },
    ],
    summaries: [
      person('ana', 'Ana Ruiz'),
      person('raj', 'Raj Mehta'),
      person('leo', 'Leo Okafor'),
      person('sam', 'Sam Patel'),
    ],
    searchQuery: '',
    searchResults: [],
    overlap: {
      viewer_timezone: 'Europe/Madrid',
      viewer_has_schedule: true,
      candidates: [
        {
          with: 'raj',
          both_have_schedules: true,
          with_timezone: 'Asia/Kolkata',
          slots: [
            { start: at(7, 9), end: at(7, 9, 30) },
            { start: at(7, 9, 30), end: at(7, 10) },
          ],
          truncated: false,
        },
      ],
    },
    matchesByAnchor: {
      spaceana: [
        ['spaceraj', match(1)],
        ['spaceleo', match(4)],
      ],
    },
    anchors: [],
    matchesKnown: true,
  });
  mocks.create.mockReset();
  mocks.prompt.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AdminNewMatchDialog', () => {
  it('lists everyone with availability, and finds anyone else by name to ask for theirs', () => {
    const { rerender } = renderDialog();
    expect(people().map(row => within(row).getByText(/Ruiz|Mehta|Okafor|Patel/).textContent)).toEqual([
      'Ana Ruiz',
      'Leo Okafor',
      'Raj Mehta',
    ]);

    mocks.searchQuery = 'sam';
    mocks.searchResults = [{ id: 'sam' }];
    rerender(<AdminNewMatchDialog open onOpenChange={vi.fn()} onSent={vi.fn()} />);

    const sam = people()[0];
    expect(sam).toHaveTextContent('Sam Patel');
    expect(sam).toHaveTextContent('No availability set');
    expect(within(sam).queryByRole('button', { name: /Select/ })).not.toBeInTheDocument();
    expect(within(sam).getByRole('button', { name: 'Request availability from Sam Patel' })).toBeInTheDocument();
  });

  it('says whether the availability request went out', async () => {
    mocks.searchQuery = 'sam';
    mocks.searchResults = [{ id: 'sam' }];
    mocks.prompt.mockResolvedValueOnce({ sent: false });
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request availability from Sam Patel' }));
    });
    expect(mocks.prompt).toHaveBeenCalledWith('sam');
    expect(screen.getByText('No email on file')).toBeInTheDocument();
  });

  it('ranks everyone by matches with debater 1 once picked', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    expect(mocks.anchors.at(-1)).toBe('spaceana');
    const rows = people();
    expect(rows[0]).toHaveTextContent('Leo Okafor');
    expect(rows[0]).toHaveTextContent('4 matches with Ana');
    expect(rows[1]).toHaveTextContent('1 match with Ana');
  });

  it('offers their shared half-hours with both clocks, and sends the invites for the one picked', () => {
    const { onSent } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    const slot = screen
      .getAllByRole('button', { pressed: false })
      .find(button => /Ana .*Raj /.test(button.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(slot);
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
    const [variables, options] = mocks.create.mock.calls[0];
    expect(variables).toMatchObject({ firstUserId: 'ana', secondUserId: 'raj' });
    expect(variables.start.toISOString()).toBe(at(7, 9));
    options.onSuccess();
    expect(onSent).toHaveBeenCalledWith('Invites sent to Ana Ruiz and Raj Mehta.');
  });

  it('says when two schedules never overlap, and flags a time picked anyway', () => {
    (mocks.overlap as { candidates: { slots: unknown[] }[] }).candidates[0].slots = [];
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    expect(screen.getByText(/have both set availability, but it never overlaps/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Pick any time' })[0]);
    expect(screen.getByRole('radio', { name: 'Pick any time' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText(/Not a time they.re both free/).length).toBeGreaterThan(0);
  });

  it('does not rank or count matches until they are known for debater 1', () => {
    mocks.matchesKnown = false;
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    expect(screen.getByText('Counting matches with Ana Ruiz…')).toBeInTheDocument();
    expect(screen.queryByText(/matches? with Ana$/)).not.toBeInTheDocument();
    expect(people()[0]).toHaveTextContent('Leo Okafor');
  });

  it('asks each debater once, however often Ask both is pressed', async () => {
    (mocks.overlap as { candidates: { slots: unknown[] }[] }).candidates[0].slots = [];
    mocks.prompt.mockImplementation((userId: string) => Promise.resolve({ sent: userId === 'ana' }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    const ask = screen.getByRole('button', { name: 'Ask both to widen availability' });
    await act(async () => {
      fireEvent.click(ask);
      fireEvent.click(ask);
    });
    expect(mocks.prompt.mock.calls.map(([userId]) => userId)).toEqual(['ana', 'raj']);
    expect(screen.getByText('Asked Ana · Raj: No email on file')).toBeInTheDocument();
  });

  it('flags nothing in Pick any time until their shared times are known', () => {
    mocks.overlap = undefined;
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));

    expect(screen.getByText(/Checking whether they.re both free then/)).toBeInTheDocument();
    expect(screen.queryByText(/Not a time they.re both free/)).not.toBeInTheDocument();
  });

  it('keeps Send invites off until two debaters and a time are picked', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
    expect(screen.getByText('Pick two debaters, then a time.')).toBeInTheDocument();
  });
});
