import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ClaimSummaryModel,
  type EntityListSectionModel,
  type SplitBreakdown,
  computeSplitGap,
  isClaimSplit,
} from '../models';
import {
  ClaimExplorer,
  ClaimSummaryCard,
  EntityActionProvider,
  EntityFlagsSection,
  GraphConnectionsStrip,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TemplateBreadcrumb,
  TemplateTitleRow,
  VoteBox,
} from './index';

afterEach(cleanup);

const CONTESTED_SPLIT: SplitBreakdown = {
  isSplit: true,
  gapPoints: 88,
  totalVotes: 2418,
  rows: [
    { id: 'pp', label: 'Community A', color: '#6833ff', percent: 94, voterCount: 1180 },
    { id: 'pi', label: 'Community B', color: '#3963fe', percent: 6, voterCount: 1090 },
    { id: 'all', label: 'Everyone', color: '#202020', percent: 52, voterCount: 2418, isEveryone: true },
  ],
};

describe('template model helpers', () => {
  it('computes community spread ignoring the Everyone bar', () => {
    expect(computeSplitGap(CONTESTED_SPLIT.rows)).toBe(88);
    expect(isClaimSplit(88)).toBe(true);
    expect(isClaimSplit(12)).toBe(false);
    expect(computeSplitGap([{ percent: 65, isEveryone: true }])).toBeUndefined();
  });
});

describe('SplitBars', () => {
  it('renders rounded integer percentages and accessible meters', () => {
    render(<SplitBars rows={CONTESTED_SPLIT.rows} density="full" />);

    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('6%')).toBeInTheDocument();
    expect(screen.getByText('52%')).toBeInTheDocument();
    expect(screen.getAllByRole('meter')).toHaveLength(3);
  });
});

describe('VoteBox', () => {
  it('fires vote and clear callbacks and reflects active pressed state', () => {
    const onVote = vi.fn();
    const onClear = vi.fn();

    const { rerender } = render(
      <VoteBox
        split={CONTESTED_SPLIT}
        control={{
          userVote: null,
          countSummary: '2,418 votes in all',
          hint: 'Sign in to vote.',
          onVote,
          onClear,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(onVote).toHaveBeenCalledWith('agree');
    expect(screen.getByText('Sign in to vote.')).toBeInTheDocument();

    rerender(
      <VoteBox
        split={CONTESTED_SPLIT}
        control={{
          userVote: 'agree',
          countSummary: '2,419 votes in all',
          impactNote: 'Counted in Everyone.',
          onVote,
          onClear,
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('You agreed.')).toBeInTheDocument();
    expect(screen.getByText('Counted in Everyone.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('ClaimSummaryCard', () => {
  it('renders contested lead card metadata and triggers selection', () => {
    const onSelect = vi.fn();
    const claim: ClaimSummaryModel = {
      id: 'c-1',
      title: 'Example contested claim',
      kind: 'judgment',
      split: CONTESTED_SPLIT,
      overallPercent: 52,
      meta: ['2,418 votes', '7 debates'],
      onSelect,
    };

    render(<ClaimSummaryCard claim={claim} variant="lead" />);

    expect(screen.getByText('Judgment')).toBeInTheDocument();
    expect(screen.queryByText(/pts apart/i)).toBeNull();
    expect(screen.getAllByText('52%')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('SourceChipList', () => {
  it('renders numbered citation buttons', () => {
    const onSelect = vi.fn();
    render(
      <SourceChipList
        sources={[
          { id: 's-1', index: 1, title: 'UNOSAT damage survey', onSelect },
          { id: 's-2', index: 2, title: 'IPC Famine Review' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /UNOSAT damage survey/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByText('IPC Famine Review')).toBeInTheDocument();
  });
});

describe('RelatedListSection', () => {
  it('hides type badges on homogeneous lists and shows them on mixed lists', () => {
    const homogeneous: EntityListSectionModel = {
      id: 'sources',
      title: 'Sources',
      items: [
        { id: 's1', kind: 'source', kindLabel: 'Source', title: 'Primary report A' },
        { id: 's2', kind: 'source', kindLabel: 'Source', title: 'Primary report B' },
      ],
    };

    const { rerender } = render(<RelatedListSection section={homogeneous} />);
    expect(screen.queryByText('Source')).toBeNull();

    const mixed: EntityListSectionModel = {
      id: 'cited-by',
      title: 'Cited by',
      items: [
        { id: 'e1', kind: 'event', kindLabel: 'Event', title: 'October ceasefire' },
        { id: 'n1', kind: 'news-story', kindLabel: 'News', title: 'Coverage article' },
      ],
    };

    rerender(<RelatedListSection section={mixed} />);
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('News')).toBeInTheDocument();
  });

  it('renders empty state and action button when provided', () => {
    const onAdd = vi.fn();
    render(
      <RelatedListSection
        section={{
          id: 'empty',
          title: 'Sources',
          items: [],
          emptyText: 'No sources linked yet.',
          action: { label: '+ Add a source', onClick: onAdd },
        }}
      />
    );

    expect(screen.getByText('No sources linked yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add a source' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders rich media cards for video, tweet, article, and dataset sources', () => {
    render(
      <RelatedListSection
        section={{
          id: 'rich-sources',
          title: 'Key sources',
          layout: 'cards',
          items: [
            {
              id: 'vid-1',
              kind: 'source',
              kindLabel: 'Video',
              mediaType: 'video',
              title: 'ICJ Oral Hearing',
              publisher: 'ICJ',
              date: '12 Jan 2024',
              duration: '18:40',
            },
            {
              id: 'tw-1',
              kind: 'source',
              kindLabel: 'Post',
              mediaType: 'tweet',
              title: 'Official statement',
              publisher: 'Official Account',
              authorHandle: '@official',
              excerpt: 'Key quote from the post.',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('18:40')).toBeInTheDocument();
    expect(screen.getByText('@official')).toBeInTheDocument();
    expect(screen.getByText('Key quote from the post.')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-masonry-col]').length).toBeGreaterThan(0);
  });

  it("puts an X post card's date under the author with the handle, not beside the card actions", () => {
    render(
      <RelatedListSection
        section={{
          id: 'x-sources',
          title: 'Sources',
          layout: 'cards',
          items: [
            {
              id: 'tw-2',
              kind: 'source',
              kindLabel: 'Post',
              mediaType: 'tweet',
              title: 'Rates are going up',
              publisher: 'Stella Example',
              authorHandle: '@stella',
              date: '3 Nov 2026',
              excerpt: 'Rates are going up.',
            },
            {
              id: 'tw-3',
              kind: 'source',
              kindLabel: 'Post',
              mediaType: 'tweet',
              title: 'No handle here',
              publisher: 'Plain Account',
              date: '4 Nov 2026',
              excerpt: 'No handle here.',
            },
          ],
        }}
      />
    );

    const withHandle = screen.getByText('@stella · 3 Nov 2026');
    expect(withHandle.parentElement).toHaveTextContent('Stella Example');
    const dateOnly = screen.getByText('4 Nov 2026');
    expect(dateOnly.parentElement).toHaveTextContent('Plain Account');
  });
});

describe('TemplateBreadcrumb', () => {
  it('marks the final crumb as current page and invokes parent callbacks', () => {
    const onRoot = vi.fn();
    render(
      <TemplateBreadcrumb
        items={[
          { id: 'topic', label: 'Topic root', onSelect: onRoot },
          { id: 'claim', label: 'Current claim' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Topic root' }));
    expect(onRoot).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Current claim')).toHaveAttribute('aria-current', 'page');
  });
});

describe('TemplateTitleRow', () => {
  it('stacks the actions above the title below 560px and puts them beside it from 560px', () => {
    render(
      <TemplateTitleRow actions={<button type="button">Menu</button>}>
        <h1>A sentence-long event title</h1>
      </TemplateTitleRow>
    );

    const actions = screen.getByRole('button', { name: 'Menu' }).parentElement!;
    const row = actions.parentElement!;
    // The actions come after the title in the DOM (reading order) and column-reverse draws them on top.
    expect(row.lastElementChild).toBe(actions);
    expect(row.firstElementChild).toBe(screen.getByRole('heading', { name: 'A sentence-long event title' }));
    expect(row).toHaveClass('flex-col-reverse', '@[560px]:flex-row', '@[560px]:justify-between');
    expect(actions).toHaveClass('shrink-0', 'self-end', '@[560px]:self-auto', '@[560px]:pt-1.5');
  });

  it('takes a different top offset for the actions', () => {
    render(
      <TemplateTitleRow actions={<button type="button">Menu</button>} actionsClassName="@[560px]:pt-1">
        <h1>Show</h1>
      </TemplateTitleRow>
    );

    const actions = screen.getByRole('button', { name: 'Menu' }).parentElement!;
    expect(actions).toHaveClass('@[560px]:pt-1');
    expect(actions).not.toHaveClass('@[560px]:pt-1.5');
  });
});

describe('Context & Disputes empty states, inline pill +, and pagination', () => {
  it('renders empty Context and Disputes sections cleanly and paginates when rows exceed page size', () => {
    const target = { id: 'e-pag', kind: 'Claim', title: 'Paginated claim' };
    const manyGroups = Array.from({ length: 7 }, (_, i) => ({
      predicate: `Relation ${i + 1}`,
      items: [{ id: `item-${i + 1}`, label: `Target ${i + 1}`, kind: 'entity' as const }],
    }));

    const { rerender } = render(
      <EntityActionProvider>
        <GraphConnectionsStrip groups={[]} target={target} />
        <EntityFlagsSection target={target} />
      </EntityActionProvider>
    );

    expect(screen.getByText('No context added yet.')).toBeInTheDocument();
    const noDisputes = screen.getByText('No disputes');
    expect(noDisputes).toBeInTheDocument();
    expect(noDisputes.closest('section')?.querySelectorAll('svg')).toHaveLength(1); // only the '+' icon button

    // Clicking `+` on Context opens an anchored popover (no full-screen modal) and adds triples
    fireEvent.click(screen.getByRole('button', { name: 'Add context' }));
    const ctxPopover = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText(/Property \(relation key\)/i), { target: { value: 'Jurisdiction' } });
    fireEvent.change(screen.getByLabelText(/Values \(comma-separated\)/i), { target: { value: 'ICJ' } });
    fireEvent.click(ctxPopover.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(screen.getByText('Jurisdiction')).toBeInTheDocument();
    expect(screen.getByText('ICJ')).toBeInTheDocument();

    // Clicking `+` on Disputes opens an anchored popover and submits a dispute
    fireEvent.click(screen.getByRole('button', { name: 'Add dispute' }));
    fireEvent.change(screen.getByLabelText(/Why are you disputing this/i), {
      target: { value: 'Needs primary source citation for this timeline.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit dispute' }));
    expect(screen.getByText(/Needs primary source citation for this timeline/i)).toBeInTheDocument();

    rerender(
      <EntityActionProvider>
        <GraphConnectionsStrip groups={manyGroups} target={target} />
      </EntityActionProvider>
    );

    expect(screen.getByText('Relation 1')).toBeInTheDocument();
    expect(screen.queryByText('Relation 6')).toBeNull();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Relation 6')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('ListRanking header control & workspace', () => {
  it('opens the 2-column ranking workspace from the list header icon, builds a personal ranking, and reorders the list live', () => {
    window.localStorage.clear();
    const claims: ClaimSummaryModel[] = [
      {
        id: 'rank-c1',
        title: 'First global claim',
        kind: 'fact',
        split: { rows: [], isSplit: true, totalVotes: 20 },
      },
      {
        id: 'rank-c2',
        title: 'Second global claim',
        kind: 'judgment',
        split: { rows: [], isSplit: true, totalVotes: 12 },
      },
      {
        id: 'rank-c3',
        title: 'Third global claim',
        kind: 'fact',
        split: { rows: [], isSplit: true, totalVotes: 4 },
      },
    ];

    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={claims} agreedClaims={[]} />
      </EntityActionProvider>
    );

    // Ranking icon sits beside `+` (Add claim)
    const rankBtn = screen.getByRole('button', { name: 'Rank Claims' });
    expect(rankBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add claim' })).toBeInTheDocument();

    fireEvent.click(rankBtn);

    const dialog = screen.getByRole('dialog', { name: 'Rank Claims' });
    expect(dialog).toBeInTheDocument();

    // Add Third global claim first, then First global claim
    const globalSection = within(dialog).getByRole('region', { name: 'Global ranking' });
    fireEvent.click(within(globalSection).getByRole('button', { name: 'Add Third global claim to my ranking' }));
    fireEvent.click(within(globalSection).getByRole('button', { name: 'Add First global claim to my ranking' }));

    expect(within(globalSection).getByText('You: #1')).toBeInTheDocument();
    expect(within(globalSection).getByText('You: #2')).toBeInTheDocument();

    // Publish ranking closes the overlay and activates the Global / My ranking switcher
    const mySection = within(dialog).getByRole('region', { name: 'My ranking' });
    fireEvent.click(within(mySection).getByRole('button', { name: 'Publish ranking' }));

    expect(screen.queryByRole('dialog', { name: 'Rank Claims' })).toBeNull();
    expect(screen.getByRole('button', { name: 'My ranking' })).toHaveAttribute('aria-pressed', 'true');

    // In My ranking view, Third global claim is now ranked #1 above First global claim
    const thirdEl = screen.getByText('Third global claim');
    const firstEl = screen.getByText('First global claim');
    expect(thirdEl.compareDocumentPosition(firstEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Switching back to Global restores the original order
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));
    const firstRestored = screen.getByText('First global claim');
    const thirdRestored = screen.getByText('Third global claim');
    expect(firstRestored.compareDocumentPosition(thirdRestored) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
