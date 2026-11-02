import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DebateClaimPositionSummary } from '../api';
import type { ClaimOrderFacts } from './claim-order-facts';

const mocks = vi.hoisted(() => ({ isMobile: false }));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => mocks.isMobile }));
// The panel bar names its spaces; these tests are about what it records, not the names.
vi.mock('~/core/hooks/use-space-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/use-space-labels')>()),
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
}));

const { HubFiltersBar, PanelFiltersBar, panelFacetOptions, sortClaimRows } = await import('./hub-filters');

beforeAll(() => {
  // Radix poppers and the pill row measure themselves; jsdom ships no observer.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  mocks.isMobile = false;
});

const SORTS = [
  { value: 'best', label: 'Best' },
  { value: 'newest', label: 'Newest' },
];

function Harness({
  onClearAll = vi.fn(),
  initialTopics = [],
  onToggle,
}: {
  onClearAll?: () => void;
  initialTopics?: string[];
  onToggle?: (option: { kind: string; id: string }) => void;
}) {
  const [sort, setSort] = React.useState('best');
  const [online, setOnline] = React.useState(false);
  const [show, setShow] = React.useState('unanswered');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [topics, setTopics] = React.useState<string[]>(initialTopics);
  return (
    <HubFiltersBar
      analyticsSurface="hub"
      search=""
      onSearchChange={() => {}}
      searchPlaceholder="Search claims"
      sort={{ options: SORTS, value: sort, onChange: setSort }}
      choice={{
        heading: 'Show',
        options: [
          { value: 'unanswered', label: 'Not answered' },
          { value: 'all', label: 'All', chipLabel: 'All claims' },
        ],
        value: show,
        defaultValue: 'unanswered',
        onChange: setShow,
      }}
      toggles={[
        {
          id: 'online',
          label: 'Someone online to debate',
          chipLabel: 'Someone online',
          checked: online,
          onChange: setOnline,
        },
      ]}
      facets={{
        heading: 'Spaces and topics',
        options: [{ kind: 'space', id: 'space1', name: 'Crypto', count: 3 }],
        pickedSpaceIds: picked,
        pickedTopicIds: topics,
        onToggle: option => {
          onToggle?.(option);
          if (option.kind === 'topic') setTopics(current => current.filter(id => id !== option.id));
          else setPicked(current => (current.includes(option.id) ? [] : [option.id]));
        },
        onClear: () => {
          setPicked([]);
          setTopics([]);
        },
      }}
      resultCount={7}
      onClearAll={() => {
        setOnline(false);
        setShow('unanswered');
        setPicked([]);
        onClearAll();
      }}
    />
  );
}

const openFilters = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  return screen.findByRole('dialog', { name: 'Filters' });
};

describe('HubFiltersBar', () => {
  it('is one search field and one Filters button, with nothing on until something is picked', () => {
    render(<Harness />);

    expect(screen.getByRole('textbox', { name: 'Search claims' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('never counts Sort as a filter', async () => {
    render(<Harness />);
    const filters = await openFilters();

    fireEvent.click(within(filters).getByRole('radio', { name: 'Newest' }));

    expect(within(filters).getByRole('radio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(within(filters).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('shows each active filter as a chip that removes it on its own', async () => {
    render(<Harness />);
    const filters = await openFilters();
    fireEvent.click(within(filters).getByRole('checkbox', { name: 'Someone online to debate' }));
    fireEvent.click(within(filters).getByRole('radio', { name: 'All' }));
    fireEvent.click(within(filters).getByRole('button', { name: /Crypto/ }));

    expect(screen.getByRole('button', { name: 'Filters, 3 on' })).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: 'Active filters' });
    expect(
      within(chips)
        .getAllByRole('button', { name: /^Remove / })
        .map(chip => chip.textContent)
    ).toEqual(['All claims', 'Someone online', 'Crypto']);

    fireEvent.click(within(chips).getByRole('button', { name: 'Remove Someone online' }));

    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toBeInTheDocument();
    expect(within(filters).getByRole('checkbox', { name: 'Someone online to debate' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  // A picked topic can drop out of the options (its count went to nothing under a later pick). Its
  // chip still has to remove a topic: read as a space, removing it would add it to the spaces.
  it('removes a picked topic missing from the options as a topic, not a space', () => {
    const onToggle = vi.fn();
    render(<Harness initialTopics={['topic-gone']} onToggle={onToggle} />);

    const chip = screen.getByRole('button', { name: 'Remove Topic' });
    fireEvent.click(chip);

    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'topic', id: 'topic-gone' }));
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  // The shared segmented control: one tab stop, arrow keys move the choice (a radio group).
  it('moves Sort with the arrow keys, as one tab stop', async () => {
    render(<Harness />);
    const filters = await openFilters();
    const best = within(filters).getByRole('radio', { name: 'Best' });

    expect(best).toHaveAttribute('tabindex', '0');
    expect(within(filters).getByRole('radio', { name: 'Newest' })).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(best, { key: 'ArrowRight' });

    expect(within(filters).getByRole('radio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true');
  });

  // Each choice an equal share of the track, words centred (Preston, 23 Oct).
  it('draws each Sort option as an equal, centred share of the track', async () => {
    render(<Harness />);
    const filters = await openFilters();

    for (const option of within(filters).getAllByRole('radio')) {
      expect(option).toHaveClass('flex-1', 'basis-0', 'justify-center', 'text-center', 'px-3');
    }
  });

  it('says what each pick does under the pill row', async () => {
    render(<Harness />);
    const filters = await openFilters();

    expect(within(filters).getByText(/Each pick narrows further/)).toBeInTheDocument();
  });

  it('offers Clear beside the chips', () => {
    const onClearAll = vi.fn();
    render(<Harness initialTopics={['topic-gone']} onClearAll={onClearAll} />);

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Active filters' })).getByRole('button', { name: 'Clear' })
    );

    expect(onClearAll).toHaveBeenCalled();
  });

  it('offers Clear all only once something is picked, and says how many rows are left', async () => {
    const onClearAll = vi.fn();
    render(<Harness onClearAll={onClearAll} />);
    const filters = await openFilters();

    expect(within(filters).getByRole('button', { name: 'Show 7' })).toBeInTheDocument();
    expect(within(filters).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('checkbox', { name: 'Someone online to debate' }));
    fireEvent.click(within(filters).getByRole('button', { name: 'Clear all' }));

    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('closes when Show is pressed', async () => {
    render(<Harness />);
    const filters = await openFilters();

    fireEvent.click(within(filters).getByRole('button', { name: 'Show 7' }));

    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('opens as a modal sheet on a phone, Show N across its foot', async () => {
    mocks.isMobile = true;
    render(<Harness />);
    const filters = await openFilters();

    expect(filters).toHaveAttribute('aria-modal', 'true');
    expect(within(filters).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    const show = within(filters).getByRole('button', { name: 'Show 7' });
    expect(show).toHaveClass('w-full');
    fireEvent.click(within(filters).getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('puts Clear all in the phone sheet’s header once something is picked', async () => {
    mocks.isMobile = true;
    const onClearAll = vi.fn();
    render(<Harness initialTopics={['topic-gone']} onClearAll={onClearAll} />);
    const filters = await openFilters();

    fireEvent.click(within(filters).getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });
});

/** GEO-3495: the panel's Filters, each press recorded by what it chose before it is applied. */
describe('PanelFiltersBar', () => {
  function PanelHarness({ onFilterChoice }: { onFilterChoice: (choice: unknown) => void }) {
    const [sort, setSort] = React.useState('best');
    const [online, setOnline] = React.useState(false);
    const [show, setShow] = React.useState('unanswered');
    const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
    const [topicIds, setTopicIds] = React.useState<string[]>([]);
    return (
      <PanelFiltersBar
        filters={{
          sort: { options: SORTS, value: sort, onChange: setSort },
          choice: {
            heading: 'Show',
            options: [
              { value: 'unanswered', label: 'Not answered' },
              { value: 'all', label: 'All' },
            ],
            value: show,
            defaultValue: 'unanswered',
            onChange: setShow,
          },
          toggles: [
            {
              id: 'someone-online',
              label: 'Someone online to debate',
              chipLabel: 'Someone online',
              checked: online,
              onChange: setOnline,
            },
          ],
          onClearExtras: () => {
            setShow('unanswered');
            setOnline(false);
          },
        }}
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search claims"
        spaces={[{ id: 'space1', count: 2 }]}
        topics={[{ id: 'topic1', name: 'Bitcoin', count: 1 }]}
        spaceIds={spaceIds}
        topicIds={topicIds}
        onSpaceToggle={id => setSpaceIds(current => (current.includes(id) ? [] : [id]))}
        onSpacesClear={() => setSpaceIds([])}
        onTopicIdsChange={update => setTopicIds(update)}
        onFilterChoice={onFilterChoice}
        listedCount={3}
        resultCount={3}
      />
    );
  }

  it('records each control as the viewer sets it', async () => {
    const onFilterChoice = vi.fn();
    render(<PanelHarness onFilterChoice={onFilterChoice} />);
    const filters = await openFilters();

    fireEvent.click(within(filters).getByRole('radio', { name: 'Newest' }));
    fireEvent.click(within(filters).getByRole('radio', { name: 'All' }));
    fireEvent.click(within(filters).getByRole('checkbox', { name: 'Someone online to debate' }));
    fireEvent.click(within(filters).getByRole('button', { name: /Space/ }));
    fireEvent.click(within(filters).getByRole('button', { name: /Bitcoin/ }));
    fireEvent.click(within(filters).getByRole('button', { name: /Bitcoin/ }));

    expect(onFilterChoice.mock.calls.map(([choice]) => choice)).toEqual([
      { kind: 'sort', value: 'newest' },
      { kind: 'show', value: 'all' },
      { kind: 'toggle', value: 'someone-online', selected: true },
      { kind: 'space', value: 'space1', selected: true },
      { kind: 'topic', value: 'topic1', selected: true },
      { kind: 'topic', value: 'topic1', selected: false },
    ]);
  });

  // The segmented controls answer a press on the option already set, which chose nothing.
  it('does not record pressing the Sort or Show already set', async () => {
    const onFilterChoice = vi.fn();
    render(<PanelHarness onFilterChoice={onFilterChoice} />);
    const filters = await openFilters();

    fireEvent.click(within(filters).getByRole('radio', { name: 'Best' }));
    fireEvent.click(within(filters).getByRole('radio', { name: 'Not answered' }));

    expect(onFilterChoice).not.toHaveBeenCalled();
  });

  it('records Clear all once, rather than as each thing it cleared', async () => {
    const onFilterChoice = vi.fn();
    render(<PanelHarness onFilterChoice={onFilterChoice} />);
    const filters = await openFilters();
    fireEvent.click(within(filters).getByRole('checkbox', { name: 'Someone online to debate' }));
    fireEvent.click(within(filters).getByRole('button', { name: /Space/ }));
    onFilterChoice.mockClear();

    fireEvent.click(within(filters).getByRole('button', { name: 'Clear all' }));

    expect(onFilterChoice.mock.calls.map(([choice]) => choice)).toEqual([{ kind: 'filters', value: 'all' }]);
  });
});

describe('panelFacetOptions', () => {
  const labels = new Map([
    ['space1', { name: 'Crypto', image: null }],
    ['space2', { name: 'Health', image: null }],
  ]);
  const spaces = [
    { id: 'space1', count: 3 },
    { id: 'space2', count: 2 },
  ];
  const topics = [
    { id: 'topic1', name: 'AI', count: 2 },
    { id: 'topic2', name: 'Energy', count: 0 },
  ];
  const ids = (options: { id: string }[]) => options.map(option => option.id);

  it('leads with spaces and keeps topics back until a space is picked', () => {
    const options = panelFacetOptions({
      spaces,
      topics,
      spaceIds: [],
      topicIds: [],
      listedCount: 5,
      labelsById: labels,
      labelsLoading: false,
    });

    expect(ids(options)).toEqual(['space1', 'space2']);
    expect(options[0]).toMatchObject({ kind: 'space', name: 'Crypto' });
  });

  // GEO-3491: a lobby's Today's claims tab draws the debate-again picker's row, topics included.
  it('offers topics beside the spaces from the start when asked to', () => {
    const options = panelFacetOptions({
      spaces,
      topics,
      spaceIds: [],
      topicIds: [],
      listedCount: 5,
      labelsById: labels,
      labelsLoading: false,
      topicsWithSpaces: true,
    });

    expect(ids(options)).toEqual(['space1', 'space2', 'topic1']);
  });

  it('drops the other spaces once one is picked, since a claim lives in one, and brings topics in', () => {
    const options = panelFacetOptions({
      spaces,
      topics,
      spaceIds: ['space1'],
      topicIds: [],
      listedCount: 3,
      labelsById: labels,
      labelsLoading: false,
    });

    // Energy would leave nothing, so it drops out rather than sitting there at zero.
    expect(ids(options)).toEqual(['space1', 'topic1']);
  });

  it('keeps every space for lists whose rows sit in several (people)', () => {
    const options = panelFacetOptions({
      spaces,
      spaceIds: ['space1'],
      listedCount: 3,
      labelsById: labels,
      labelsLoading: false,
      spacesAreExclusive: false,
    });

    expect(ids(options)).toEqual(['space1', 'space2']);
  });

  it('offers topics straight away when there is no space to pick', () => {
    const options = panelFacetOptions({
      spaces: [{ id: 'space1', count: 4 }],
      topics,
      spaceIds: [],
      topicIds: [],
      listedCount: 4,
      labelsById: labels,
      labelsLoading: false,
    });

    // The one space is every row, so it narrows nothing and is not offered.
    expect(ids(options)).toEqual(['topic1']);
  });
});

describe('sortClaimRows', () => {
  const side = (position: boolean, available: number): DebateClaimPositionSummary =>
    ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_count: available,
      available_now_count: available,
      participants: [],
    }) as DebateClaimPositionSummary;
  const row = (id: string, againstNow: number) => ({
    claim: { claim_entity_id: id },
    positions: [side(true, 9), side(false, againstNow)],
    viewer_response: { position: true },
  });
  const facts = new Map<string, ClaimOrderFacts>([
    ['a', { rankingScore: 1, createdAtMs: 300 }],
    ['b', { rankingScore: 5, createdAtMs: 100 }],
    ['c', { rankingScore: null, createdAtMs: 200 }],
  ]);
  const order = (rows: { claim: { claim_entity_id: string } }[]) => rows.map(entry => entry.claim.claim_entity_id);
  const rows = [row('a', 1), row('b', 3), row('c', 2)];

  it('orders Best by Explore’s ranking, unscored last', () => {
    expect(order(sortClaimRows(rows, 'best', facts))).toEqual(['b', 'a', 'c']);
  });

  it('orders Newest by creation time', () => {
    expect(order(sortClaimRows(rows, 'newest', facts))).toEqual(['a', 'c', 'b']);
  });

  it('orders Most people by who could take the other side now, not the viewer’s own side', () => {
    expect(order(sortClaimRows(rows, 'people', facts))).toEqual(['b', 'c', 'a']);
  });

  it('keeps the order rows arrived in where they tie', () => {
    const tied = [row('x', 1), row('y', 1), row('z', 1)];
    expect(order(sortClaimRows(tied, 'people', new Map()))).toEqual(['x', 'y', 'z']);
  });
});
