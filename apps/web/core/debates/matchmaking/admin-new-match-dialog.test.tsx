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
  debateSpacesByPerson: new Map<string, string[]>(),
  matchesKnown: true,
  anchors: [] as (string | null | undefined)[],
  create: vi.fn(),
  debatersError: null as Error | null,
  refetchDebaters: vi.fn(),
  prompt: vi.fn(),
  // GEO-3224: gaia's pair fit, by anchor profile space id; null is gaia unavailable.
  fitByAnchor: {} as Record<string, [string, unknown][] | null>,
  fitAnchors: [] as (string | null)[],
  freeSlots: new Map<string, number>(),
  // GEO-3231: each debater's own free windows, by user id.
  availability: {} as Record<string, { start: string; end: string; viewer_free: boolean }[]>,
}));

vi.mock('./admin-hooks', () => ({
  ADMIN_MATCH_DAYS: 14,
  useAdminDebaters: () =>
    mocks.debatersError
      ? {
          data: undefined,
          isPending: false,
          error: mocks.debatersError,
          refetch: mocks.refetchDebaters,
          timezoneByUser: new Map(),
        }
      : {
          data: mocks.debaters,
          isPending: false,
          error: null,
          refetch: mocks.refetchDebaters,
          timezoneByUser: new Map(mocks.debaters.map(debater => [debater.user_id, debater.timezone])),
        },
  useAdminDebaterAvailability: (userId: string | null) =>
    userId
      ? {
          data: {
            with_timezone: mocks.debaters.find(debater => debater.user_id === userId)?.timezone ?? '',
            their_slots: mocks.availability[userId] ?? [],
          },
          dataUpdatedAt: Date.now(),
          isPending: false,
          error: null,
          refetch: vi.fn(),
        }
      : { isPending: false, error: null, refetch: vi.fn() },
  useAdminPairOverlap: (first: string | null, second: string | null) =>
    first && second
      ? { data: mocks.overlap, isPending: mocks.overlap === undefined, error: null, refetch: vi.fn() }
      : { isPending: false },
  useCreateAdminMatch: () => ({ mutate: mocks.create, isPending: false, error: null }),
  useAdminAvailabilityPrompt: () => ({ mutateAsync: mocks.prompt }),
}));
vi.mock('./admin-pair-fit', () => ({
  useAdminPairFit: (anchor: string | null) => {
    mocks.fitAnchors.push(anchor);
    const items = anchor ? mocks.fitByAnchor[anchor] : null;
    return { available: Boolean(items), byProfile: new Map(items ?? []), isPending: false };
  },
  useAdminSharedFreeSlots: (first: string | null) => (first ? mocks.freeSlots : new Map()),
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
        byProfileAndSpace: new Map(
          (anchorProfileSpaceId ? (mocks.matchesByAnchor[anchorProfileSpaceId] ?? []) : []).map(([profile, list]) => {
            const bySpace = new Map<string, unknown[]>();
            for (const item of list as { spaceId: string }[])
              bySpace.set(item.spaceId, [...(bySpace.get(item.spaceId) ?? []), item]);
            return [profile, bySpace];
          })
        ),
      },
      matchingSpaceIds: [],
      matchingClaimNamesById: new Map([
        ['claim0', 'Nuclear is green'],
        ['claim1', 'Bitcoin is money'],
      ]),
      matchingClaimsLoading: false,
      records: new Map(),
      debateSpacesByPerson: mocks.debateSpacesByPerson,
      spaceActivityUnavailable: false,
      publishableSpacesPending: false,
      personRecordsPending: false,
    };
  },
}));
// One pill per space, toggling it the way the real menu does.
vi.mock('./space-filter-pills', () => ({
  SpaceFilterPills: ({ onSpaceToggle }: { onSpaceToggle: (spaceId: string) => void }) => (
    <>
      {['crypto', 'energy'].map(spaceId => (
        <button key={spaceId} type="button" onClick={() => onSpaceToggle(spaceId)}>
          Space {spaceId}
        </button>
      ))}
    </>
  ),
}));
vi.mock('./use-space-filter-selection', () => ({
  useSpaceFilterMenu: ({ spaceIds, setSpaceIds }: { spaceIds: string[]; setSpaceIds: (next: string[]) => void }) => ({
    facetSpaces: [],
    onSpaceToggle: (spaceId: string) =>
      setSpaceIds(spaceIds.includes(spaceId) ? spaceIds.filter(id => id !== spaceId) : [...spaceIds, spaceId]),
    onSpacesClear: vi.fn(),
  }),
}));
vi.mock('~/core/hooks/use-space-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-space-labels')>()),
  useSpaceLabels: () => ({ labelsById: new Map() }),
}));
vi.mock('./person-space-icons', () => ({ PersonSpaceIcon: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('./person-record-line', () => ({
  PersonRecordLine: ({ match }: { match?: React.ReactNode }) => <>{match}</>,
}));
vi.mock('~/partials/availability/peer-availability', () => ({
  MUTUAL_SLOT: 'mutual',
  SELECTED_SLOT: 'selected',
  LegendItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
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
const fitItem = (userId: string, score: number, reason: unknown) => ({
  userId,
  score,
  parts: { interest: 0, disagreement: 0, sharedClaims: 0, opposed: 1, agreed: 0, accountWeight: 1 },
  disagreeing: (reason as { kind?: string } | null)?.kind === 'disagree',
  reason,
});
const match = (n: number, spaceId = 'energy') =>
  Array.from({ length: n }, (_, index) => ({
    claimId: `claim-${index}`,
    spaceId,
    responseKind: 'stance',
    viewerPosition: true,
    personPosition: false,
  }));

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
    debateSpacesByPerson: new Map(),
    anchors: [],
    fitByAnchor: {},
    fitAnchors: [],
    freeSlots: new Map(),
    availability: {},
    matchesKnown: true,
    debatersError: null,
  });
  mocks.refetchDebaters.mockReset();
  window.localStorage.clear();
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
    expect(screen.getByText(/No email on file/)).toBeInTheDocument();
  });

  it.each([
    ['disabled_by_preference', /Email turned off by them/],
    ['channel_off', /Email delivery is off/],
  ])('settles on %s without offering a resend', async (outcome, text) => {
    mocks.searchQuery = 'sam';
    mocks.searchResults = [{ id: 'sam' }];
    mocks.prompt.mockResolvedValueOnce({ sent: false, outcome });
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request availability from Sam Patel' }));
    });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry|Request availability/ })).not.toBeInTheDocument();
  });

  it.each([
    ['failed', /Email failed to send/],
    ['rate_limited', /too many emails to them this hour/],
  ])('offers Retry after %s, and stops once it is sent', async (outcome, text) => {
    mocks.searchQuery = 'sam';
    mocks.searchResults = [{ id: 'sam' }];
    mocks.prompt.mockResolvedValueOnce({ sent: false, outcome }).mockResolvedValueOnce({ sent: true, outcome: 'sent' });
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request availability from Sam Patel' }));
    });
    expect(screen.getByText(text)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry requesting availability from Sam Patel' }));
    });
    expect(mocks.prompt).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Request sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
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

  it('ranks by pair fit with debater 1 when gaia has it, and says why', () => {
    mocks.fitByAnchor = {
      spaceana: [
        ['spaceraj', fitItem('spaceraj', 0.6, { kind: 'disagree', claimId: 'c1', name: 'Nuclear is green' })],
        ['spaceleo', fitItem('spaceleo', 0.2, { kind: 'shared_topic', topicId: 't1', name: 'Energy' })],
      ],
    };
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    expect(mocks.fitAnchors.at(-1)).toBe('spaceana');
    expect(screen.getByText(/Ordered by fit with Ana Ruiz/)).toBeInTheDocument();
    const rows = people();
    // Raj has one match to Leo's four, but disagrees with Ana on something both care about.
    expect(rows[0]).toHaveTextContent('Raj Mehta');
    expect(rows[0]).toHaveTextContent('Disagrees with Ana on Nuclear is green');
    expect(rows[1]).toHaveTextContent('Leo Okafor');
    expect(rows[1]).toHaveTextContent('Shares Ana’s interest in Energy');
  });

  it('halves the fit of someone with no free time in common with debater 1', () => {
    mocks.fitByAnchor = {
      spaceana: [
        ['spaceraj', fitItem('spaceraj', 0.6, null)],
        ['spaceleo', fitItem('spaceleo', 0.4, null)],
      ],
    };
    mocks.freeSlots = new Map([
      ['raj', 0],
      ['leo', 3],
    ]);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    const rows = people();
    expect(rows[0]).toHaveTextContent('Leo Okafor');
    expect(rows[1]).toHaveTextContent('Raj Mehta');
    expect(rows[1]).toHaveTextContent('No free time in common');
  });

  it('keeps the matches order exactly when pair fit is unavailable', () => {
    mocks.fitByAnchor = { spaceana: null };
    mocks.freeSlots = new Map([['leo', 0]]);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    expect(screen.getByText('Ordered by matches with Ana Ruiz, most first')).toBeInTheDocument();
    const rows = people();
    expect(rows[0]).toHaveTextContent('Leo Okafor');
    expect(rows[1]).toHaveTextContent('Raj Mehta');
    expect(screen.queryByText(/Disagrees with|Shares Ana|No free time in common/)).not.toBeInTheDocument();
  });

  it('lists the claims behind a count, with each debater’s side', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));

    const toggle = screen.getByRole('button', { name: /4 matches with Ana/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const claims = screen.getByRole('list', { name: 'Matching claims: Ana and Leo' });
    const items = within(claims).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Nuclear is green');
    expect(items[0]).toHaveTextContent(/Ana:\s*Agree/);
    expect(items[0]).toHaveTextContent(/Leo:\s*Disagree/);
    // A new tab, so following a claim never loses the match being built.
    expect(within(items[0]).getByRole('link')).toHaveAttribute('target', '_blank');

    fireEvent.click(toggle);
    expect(screen.queryByRole('list', { name: /Matching claims/ })).not.toBeInTheDocument();
  });

  it('narrows the counts, the claims and the order to the selected spaces', () => {
    mocks.matchesByAnchor = {
      spaceana: [
        ['spaceraj', match(1, 'crypto')],
        ['spaceleo', match(4, 'energy')],
      ],
    };
    mocks.debateSpacesByPerson = new Map([
      ['spaceraj', ['crypto', 'energy']],
      ['spaceleo', ['crypto', 'energy']],
    ]);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    expect(people()[0]).toHaveTextContent('Leo Okafor');

    fireEvent.click(screen.getByRole('button', { name: 'Space crypto' }));

    expect(screen.getByText('Ordered by matches with Ana Ruiz in the selected spaces, most first')).toBeInTheDocument();
    const rows = people();
    expect(rows[0]).toHaveTextContent('Raj Mehta');
    expect(rows[0]).toHaveTextContent('1 match with Ana');
    // Four matches overall, none in Crypto: zero, and nothing to open.
    expect(rows[1]).toHaveTextContent('Leo Okafor');
    expect(rows[1]).toHaveTextContent('0 matches with Ana');
    expect(within(rows[1]).queryByRole('button', { name: /matches with Ana/ })).not.toBeInTheDocument();

    fireEvent.click(within(rows[0]).getByRole('button', { name: /1 match with Ana/ }));
    expect(
      within(screen.getByRole('list', { name: 'Matching claims: Ana and Raj' })).getAllByRole('listitem')
    ).toHaveLength(1);
  });

  it('still counts shared free time while spaces are selected', () => {
    mocks.matchesByAnchor = {
      spaceana: [
        ['spaceraj', match(2, 'crypto')],
        ['spaceleo', match(3, 'crypto')],
      ],
    };
    mocks.debateSpacesByPerson = new Map([
      ['spaceraj', ['crypto']],
      ['spaceleo', ['crypto']],
    ]);
    mocks.freeSlots = new Map([
      ['raj', 4],
      ['leo', 0],
    ]);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Space crypto' }));

    // Leo's three halve below Raj's two: a pair with no time in common can't be booked.
    const rows = people();
    expect(rows[0]).toHaveTextContent('Raj Mehta');
    expect(rows[1]).toHaveTextContent('Leo Okafor');
    expect(rows[1]).toHaveTextContent('No free time in common');
  });

  it('closes a candidate’s claims when debater 1 changes', () => {
    mocks.matchesByAnchor = {
      spaceana: [['spaceleo', match(4)]],
      spaceraj: [['spaceleo', match(2)]],
    };
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: /4 matches with Ana/ }));
    expect(screen.getByRole('list', { name: 'Matching claims: Ana and Leo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    expect(screen.getByRole('button', { name: /2 matches with Raj/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: /Matching claims/ })).not.toBeInTheDocument();
  });

  it('sets pair fit aside while spaces are selected', () => {
    mocks.matchesByAnchor = {
      spaceana: [
        ['spaceraj', match(1, 'crypto')],
        ['spaceleo', match(4, 'energy')],
      ],
    };
    mocks.debateSpacesByPerson = new Map([
      ['spaceraj', ['crypto']],
      ['spaceleo', ['crypto']],
    ]);
    mocks.fitByAnchor = {
      spaceana: [
        ['spaceleo', fitItem('spaceleo', 0.9, { kind: 'disagree', claimId: 'claim-0', name: 'Nuclear is green' })],
        ['spaceraj', fitItem('spaceraj', 0.1, null)],
      ],
    };
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    expect(people()[0]).toHaveTextContent('Leo Okafor');

    fireEvent.click(screen.getByRole('button', { name: 'Space crypto' }));

    // gaia scores the pair across every space; Leo's fit is a disagreement filtered out here.
    expect(people()[0]).toHaveTextContent('Raj Mehta');
    expect(screen.queryByText(/Disagrees with Ana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ordered by fit/)).not.toBeInTheDocument();
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
    expect(screen.getByText('Asked Ana')).toBeInTheDocument();
    expect(screen.getByText(/Raj: No email on file/)).toBeInTheDocument();
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

  it('says when the people with availability could not be loaded, and offers a retry', () => {
    mocks.debatersError = new Error('down');
    renderDialog();

    expect(screen.queryByText('Nobody matches that.')).not.toBeInTheDocument();
    expect(screen.getByText('Couldn’t load the people with availability.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetchDebaters).toHaveBeenCalled();
  });

  it('drops a picked time once it passes with the dialog open', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 7, 8, 50));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(
      screen.getAllByRole('button', { pressed: false }).find(b => /^9:00/.test(b.getAttribute('aria-label') ?? ''))!
    );
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeEnabled();

    act(() => {
      vi.setSystemTime(new Date(2026, 9, 7, 9, 0, 30));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
  });

  it('drops a same-day override once its time passes', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^Starts/), {
      target: { value: '10:00' },
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeEnabled();

    act(() => {
      vi.setSystemTime(new Date(2026, 9, 6, 10, 1));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
  });

  it('books a custom start off the half-hour, and says whether they are free for all of it', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '1' } });

    // 9:45–10:15 runs past their shared 9:00–10:00.
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '09:45' } });
    expect(screen.getAllByText(/Not a time they.re both free/).length).toBeGreaterThan(0);

    // 9:15–9:45 is inside it, though geo-chat still flags anything off their half-hours.
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '09:15' } });
    expect(screen.getByLabelText(/^Starts/)).toHaveValue('09:15');
    expect(screen.getAllByText(/They.re both free then, but it isn.t one of their half-hours/).length).toBe(2);
    expect(screen.queryByText(/Not a time they.re both free/)).not.toBeInTheDocument();

    // Clearing the field keeps the last whole time rather than sending nothing or midnight.
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
    expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe(at(7, 9, 15));
  });

  it('counts a shared half-hour already under way when a custom start falls inside it', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 9, 10));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '09:15' } });

    expect(screen.getAllByText(/They.re both free then, but it isn.t one of their half-hours/).length).toBe(2);
  });

  it('shows both debaters’ availability, whose is whose, and where it overlaps', () => {
    mocks.availability = {
      ana: [{ start: at(7, 9), end: at(7, 11), viewer_free: false }],
      raj: [
        { start: at(7, 10), end: at(7, 12), viewer_free: false },
        { start: at(8, 14), end: at(8, 15), viewer_free: false },
      ],
    };
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    const strip = screen.getByRole('region', { name: /^Availability in / });
    expect(within(strip).getByText('Ana free')).toBeInTheDocument();
    expect(within(strip).getByText('Raj free')).toBeInTheDocument();
    expect(
      within(strip).getByText(
        /Wednesday, October 7: Ana free 9:00 AM–11:00 AM; Raj free 10:00 AM–12:00 PM; both free 10:00 AM–11:00 AM/
      )
    ).toBeInTheDocument();
    expect(
      within(strip).getByText(/Thursday, October 8: Ana not free; Raj free 2:00 PM–3:00 PM; never both free/)
    ).toBeInTheDocument();
  });

  it('picks a half-hour straight off the availability strip', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    // A shared half-hour is a recommendation.
    fireEvent.click(document.querySelector(`[data-start="${Date.parse(at(7, 9))}"]`)!);
    expect(screen.getByRole('radio', { name: 'Recommended' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { pressed: true, name: /^9:00/ })).toBeInTheDocument();

    // Anything else is the override, on that day at that time.
    fireEvent.click(document.querySelector(`[data-start="${Date.parse(at(8, 14))}"]`)!);
    expect(screen.getByRole('radio', { name: 'Pick any time' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/^Starts/)).toHaveValue('14:00');
    fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
    expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe(at(8, 14));
  });

  it('remembers the time zone picked for next time', () => {
    renderDialog();
    fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), { target: { value: 'UTC' } });
    cleanup();

    renderDialog();
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue('UTC');
  });

  describe('across a clock change', () => {
    const ZONE_KEY = 'geogenesis.debates.admin-match-zone.v1';
    const ms = (iso: string) => Date.parse(iso);
    const cell = (iso: string) => document.querySelector<HTMLElement>(`[data-start="${ms(iso)}"]`);

    beforeEach(() => {
      // In London, summer time ends at 2:00 AM on Sunday 25 October: 1:00–2:00 AM happens twice.
      vi.setSystemTime(new Date('2026-10-20T09:00:00Z'));
      window.localStorage.setItem(ZONE_KEY, 'Europe/London');
    });

    it('names each time’s offset as it is then, not as it is today', () => {
      (mocks.overlap as { candidates: { slots: unknown[] }[] }).candidates[0].slots = [
        { start: '2026-10-27T10:00:00Z', end: '2026-10-27T10:30:00Z' },
      ];
      renderDialog();
      fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

      // Today London is GMT+1; on the 27th it is GMT again.
      expect(screen.getByRole('button', { name: /^10:00 AM London \(GMT\),/ })).toBeInTheDocument();
      expect(cell('2026-10-27T10:00:00Z')).toHaveAttribute('title', expect.stringContaining('London (GMT) ·'));
      expect(cell('2026-10-20T10:00:00Z')).toHaveAttribute('title', expect.stringContaining('London (GMT+1) ·'));
      // What spans the fortnight names the zone alone.
      expect(screen.getByRole('region', { name: 'Availability in London' })).toBeInTheDocument();
    });

    it('draws the repeated hour twice, so time in its second pass can be seen and picked', () => {
      mocks.availability = {
        raj: [{ start: '2026-10-25T01:00:00Z', end: '2026-10-25T01:30:00Z', viewer_free: false }],
      };
      renderDialog();
      fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

      // 1:00 AM BST (00:00Z) and 1:00 AM GMT (01:00Z) are both on the strip.
      expect(cell('2026-10-25T00:00:00Z')).not.toBeNull();
      expect(cell('2026-10-25T01:00:00Z')).not.toBeNull();
      // Read aloud with each end's offset, since 1:00 AM happens twice that night.
      expect(screen.getByText(/Sunday, October 25: .*Raj free 1:00 AM GMT–1:30 AM GMT;/)).toBeInTheDocument();
      expect(screen.getByText(/Clocks go back an hour/)).toBeInTheDocument();

      fireEvent.click(cell('2026-10-25T01:00:00Z')!);
      fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
      expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe('2026-10-25T01:00:00.000Z');
    });
  });

  it('marks a half-hour clock change as half an hour', () => {
    // Lord Howe Island moves its clocks by 30 minutes; on 4 October 2026 they go forward.
    vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
    window.localStorage.setItem('geogenesis.debates.admin-match-zone.v1', 'Australia/Lord_Howe');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    expect(screen.getByText(/Clocks go forward 30 minutes: this day is 23\.5 hours\./)).toBeInTheDocument();
    expect(screen.getByText('−30m')).toBeInTheDocument();
  });

  it('gives each end of a slot the offset it has, when the clocks change inside it', () => {
    // 1:30 AM BST on 25 October ends at 1:00 AM GMT: summer time ends at 2:00 AM BST.
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z'));
    window.localStorage.setItem('geogenesis.debates.admin-match-zone.v1', 'Europe/London');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(document.querySelector(`[data-start="${Date.parse('2026-10-25T00:30:00Z')}"]`)!);

    expect(screen.getByText(/Sun, Oct 25 · 1:30 AM London \(GMT\+1\) – 1:00 AM London \(GMT\)$/)).toBeInTheDocument();
  });

  it('drops a recommended time a zone change moves off the days shown', () => {
    // 10:00 PM on the 19th in Kiritimati, the last day shown there, is the 19th's small hours in
    // Los Angeles: a day past the last one shown.
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    window.localStorage.setItem('geogenesis.debates.admin-match-zone.v1', 'Pacific/Kiritimati');
    mocks.debaters[0].timezone = 'America/Los_Angeles';
    (mocks.overlap as { candidates: { slots: unknown[] }[] }).candidates[0].slots = [
      { start: '2026-10-19T08:00:00Z', end: '2026-10-19T08:30:00Z' },
    ];
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    fireEvent.click(screen.getByRole('button', { name: /^10:00 PM Kiritimati/ }));
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeEnabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), {
      target: { value: 'America/Los_Angeles' },
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
  });

  describe('changing the time zone with Pick any time open', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-10-06T09:20:00Z'));
      window.localStorage.setItem('geogenesis.debates.admin-match-zone.v1', 'UTC');
    });

    const pickBoth = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
    };
    const switchToMadrid = () =>
      fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), { target: { value: 'Europe/Madrid' } });

    it('keeps a time chosen from the dropdowns, and shows it in the new zone', () => {
      renderDialog();
      pickBoth();
      fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Day' }), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Starts (GMT)'), { target: { value: '15:00' } });

      switchToMadrid();
      expect(screen.getByLabelText('Starts (Madrid)')).toHaveValue('17:00');
      expect(screen.getByText(/Wed, Oct 7 · 5:00 PM – 5:30 PM Madrid \(GMT\+2\)/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
      expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe('2026-10-07T15:00:00.000Z');
    });

    it('keeps a time picked off the strip, and moves the dropdowns to match', () => {
      renderDialog();
      pickBoth();
      fireEvent.click(document.querySelector(`[data-start="${Date.parse('2026-10-08T14:00:00Z')}"]`)!);
      expect(screen.getByLabelText('Starts (GMT)')).toHaveValue('14:00');

      switchToMadrid();
      expect(screen.getByLabelText('Starts (Madrid)')).toHaveValue('16:00');
      fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
      expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe('2026-10-08T14:00:00.000Z');
    });
  });

  it('says a debater’s availability is not known yet, rather than not free, before their window opens', () => {
    // 2:00 AM GMT on the 7th is still 7:00 PM on the 6th in Los Angeles. geo-chat's fortnight
    // starts at their midnight on the UTC date, so nothing before 7:00 AM GMT is known for Ana.
    vi.setSystemTime(new Date('2026-10-07T02:00:00Z'));
    mocks.debaters[0].timezone = 'America/Los_Angeles';
    mocks.availability = { ana: [{ start: '2026-10-07T15:00:00Z', end: '2026-10-07T16:00:00Z', viewer_free: false }] };
    window.localStorage.setItem('geogenesis.debates.admin-match-zone.v1', 'UTC');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));

    expect(
      screen.getByText(/Wednesday, October 7: Ana not known before 7:00 AM, free 3:00 PM–4:00 PM; Raj not free;/)
    ).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Legend' })).getByText('Not known yet')).toBeInTheDocument();
  });

  describe('for an admin west of GMT who books in GMT', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'America/Los_Angeles';
      // 9:20 AM in Los Angeles, already 4:20 PM in GMT.
      vi.setSystemTime(new Date('2026-10-06T16:20:00Z'));
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('books 15:00 GMT as that instant, and shows each debater it in their own time', () => {
      renderDialog();
      fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), { target: { value: 'UTC' } });
      fireEvent.click(screen.getByRole('button', { name: 'Select Ana Ruiz' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select Raj Mehta' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Pick any time' }));

      // Days and times are counted in GMT: today there is still the 6th, the first offered.
      const day = screen.getByRole('combobox', { name: 'Day' });
      expect(within(day).getAllByRole('option')[0]).toHaveTextContent('Tue, Oct 6');
      fireEvent.change(day, { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Starts (GMT)'), {
        target: { value: '15:00' },
      });

      expect(screen.getByText(/Wed, Oct 7 · 3:00 PM – 3:30 PM GMT/)).toBeInTheDocument();
      expect(screen.getByText('Ana 5:00 PM in Madrid · Raj 8:30 PM in Kolkata')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Send invites' }));
      // Only the instant is sent, so each invite is rendered in its debater's own zone.
      expect(mocks.create.mock.calls[0][0].start.toISOString()).toBe('2026-10-07T15:00:00.000Z');
    });
  });

  it('keeps Send invites off until two debaters and a time are picked', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
    expect(screen.getByText('Pick two debaters, then a time.')).toBeInTheDocument();
  });
});
