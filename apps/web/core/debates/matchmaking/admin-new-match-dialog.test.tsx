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
          data: { with_timezone: '', their_slots: mocks.availability[userId] ?? [] },
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
    fireEvent.change(screen.getByRole('combobox', { name: /^Starts/ }), {
      target: { value: String(10 * 60) },
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeEnabled();

    act(() => {
      vi.setSystemTime(new Date(2026, 9, 6, 10, 1));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: 'Send invites' })).toBeDisabled();
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
    expect(screen.getByRole('combobox', { name: /^Starts/ })).toHaveValue(String(14 * 60));
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
      fireEvent.change(screen.getByRole('combobox', { name: 'Starts (GMT)' }), {
        target: { value: String(15 * 60) },
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
