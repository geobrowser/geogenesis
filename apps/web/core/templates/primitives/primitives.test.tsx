import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ClaimSummaryModel,
  type EntityListSectionModel,
  type SplitBreakdown,
  computeSplitGap,
  isClaimSplit,
} from '../models';
import { TEMPLATE_ACTIONS } from '../template-actions';
import {
  ClaimExplorer,
  ClaimSummaryCard,
  ContextPeekDrawer,
  EntityActionProvider,
  EntityContextAndDisputes,
  EntityFlagsSection,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TemplateBreadcrumb,
  TemplateTitleRow,
  VoteBox,
} from './index';

const flagMocks = vi.hoisted(() => ({ templateListRanking: false }));

// Template list ranking ships off (GEO-3835); the workspace tests turn it on.
vi.mock('~/core/state/feature-flags', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/state/feature-flags')>();
  return {
    ...actual,
    useFeatureFlag: (id: Parameters<typeof actual.useFeatureFlag>[0]) =>
      id === 'templateListRanking' ? flagMocks.templateListRanking : actual.useFeatureFlag(id),
  };
});

afterEach(cleanup);

// The shipped switch, read before any test flips it, and put back after each one that does.
const SHIPPED_TEMPLATE_ACTIONS = { ...TEMPLATE_ACTIONS };
function restoreTemplateActions() {
  Object.assign(TEMPLATE_ACTIONS, SHIPPED_TEMPLATE_ACTIONS);
}

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

describe('SplitBars without an "Everyone" label (GEO-3845)', () => {
  const everyone = { id: 'all', label: 'Everyone', color: '#202020', percent: 80, voterCount: 5, isEveryone: true };

  it('draws the lone Everyone row as its bar and percentage only', () => {
    const { container } = render(<SplitBars rows={[everyone]} density="full" />);
    expect(screen.queryByText('Everyone')).toBeNull();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '80');
    // No label column left behind: the bar takes the row.
    expect(container.querySelector('.grid')).toHaveClass('grid-cols-[minmax(40px,1fr)_auto]');
  });

  it('keeps space names when other rows are listed, and still drops "Everyone"', () => {
    render(<SplitBars rows={CONTESTED_SPLIT.rows} density="compact" />);
    expect(screen.getByText('Community A')).toBeInTheDocument();
    expect(screen.getByText('Community B')).toBeInTheDocument();
    expect(screen.queryByText('Everyone')).toBeNull();
    expect(screen.getAllByRole('meter')).toHaveLength(3);
  });

  it('keeps a space-named everyone row (the Claim page names its space)', () => {
    render(<SplitBars rows={[{ ...everyone, label: 'Crypto' }]} density="full" />);
    expect(screen.getByText('Crypto')).toBeInTheDocument();
  });
});

describe('VoteBox: the debates app Agree / Disagree (GEO-3845)', () => {
  it('draws the two 36px outlined buttons and switches or retracts by press', () => {
    const onVote = vi.fn();
    const onClear = vi.fn();
    render(
      <VoteBox split={CONTESTED_SPLIT} control={{ userVote: 'disagree', countSummary: '6 votes', onVote, onClear }} />
    );

    const agree = screen.getByRole('button', { name: 'Agree' });
    const disagree = screen.getByRole('button', { name: 'Disagree' });
    expect(screen.getByRole('group', { name: 'Do you agree?' })).toContainElement(agree);
    for (const button of [agree, disagree]) expect(button).toHaveClass('h-9', 'rounded-full', 'bg-transparent');
    expect(disagree).toHaveAttribute('aria-pressed', 'true');
    expect(disagree).toHaveClass('border-[#151515]', 'font-bold');
    expect(agree).toHaveClass('border-[#8a8a8a]');
    expect(agree).not.toHaveClass('bg-text');

    fireEvent.click(agree);
    expect(onVote).toHaveBeenCalledWith('agree');
    fireEvent.click(disagree);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onVote).toHaveBeenCalledTimes(1);
  });

  it('is disabled as a pair', () => {
    render(
      <VoteBox
        split={CONTESTED_SPLIT}
        control={{ userVote: null, countSummary: '0 votes', disabled: true, onVote: vi.fn() }}
      />
    );
    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeDisabled();
  });
});

describe('VoteBox: the result leads, over a full-width split bar (GEO-3845)', () => {
  const control = { userVote: null, countSummary: '7 votes', onVote: vi.fn() } as const;
  const lone: SplitBreakdown = {
    isSplit: false,
    totalVotes: 7,
    rows: [{ id: 'wa', label: 'World affairs', color: '#202020', percent: 71, voterCount: 7, isEveryone: true }],
  };

  it('leads with a large "71% agree" and the quiet count, with no space label or prompt', () => {
    render(<VoteBox split={lone} control={control} />);
    // jsdom applies no container queries: drop the phone split line to check the wide layout alone.
    screen.getByTestId('vote-box-phone-split').remove();

    const result = screen.getByTestId('vote-box-result');
    expect(result).toHaveTextContent('71%agree·7 votes');
    const percent = within(result).getByText('71%');
    expect(percent).toHaveClass('text-[40px]', 'font-medium');
    expect(within(result).getByText('7 votes')).toHaveClass('text-grey-04');
    expect(screen.queryByText('World affairs')).toBeNull();
    expect(screen.queryByText('Do you agree?')).toBeNull();
  });

  it('puts the buttons on the result line and the bar across the card, with both shares at its ends', () => {
    render(<VoteBox split={lone} control={control} />);
    // jsdom applies no container queries: drop the phone split line to check the wide layout alone.
    screen.getByTestId('vote-box-phone-split').remove();

    const result = screen.getByTestId('vote-box-result');
    const buttons = screen.getByRole('group', { name: 'Do you agree?' });
    const meter = screen.getByRole('meter');
    expect(screen.getAllByRole('meter')).toHaveLength(1);
    expect(meter).toHaveAttribute('aria-valuenow', '71');
    expect(meter).toHaveClass('w-full', 'bg-grey-02');
    // One line on wide cards (buttons right of the result), the bar on its own line under both.
    expect(result.parentElement).toContainElement(buttons);
    expect(buttons).toHaveClass('@[680px]:order-2', 'order-3', 'w-full', '@[680px]:w-auto');
    expect(meter.closest('[class*="basis-full"]')).toHaveClass(
      'order-2',
      'hidden',
      '@[680px]:block',
      '@[680px]:order-3'
    );
    // The headline is wide-only; phones show the claim-row split line instead.
    expect(result).toHaveClass('hidden', '@[680px]:flex');
    // No Agree / Disagree share labels under the bar (Preston): the result above already says it.
    expect(screen.queryByTestId('vote-box-bar-ends')).toBeNull();
    expect(screen.queryByText('Disagree 29%')).toBeNull();
  });

  it('matches the claim rows on phones: buttons, then the split line with "71% (7)" and no label', () => {
    render(<VoteBox split={lone} control={control} />);

    const phone = screen.getByTestId('vote-box-phone-split');
    expect(phone).toHaveClass('order-4', '@[680px]:hidden');
    expect(phone).toHaveTextContent('71%(7)');
    expect(within(phone).queryByText('World affairs')).toBeNull();
    const buttons = screen.getByRole('group', { name: 'Do you agree?' });
    expect(buttons).toHaveClass('order-3', 'w-full');
  });

  it('keeps the bar ends to agree votes', () => {
    render(<VoteBox split={{ ...lone, rows: [{ ...lone.rows[0], unit: 'helpful' }] }} control={control} />);
    expect(screen.getByTestId('vote-box-result')).toHaveTextContent('71%helpful');
    expect(screen.queryByTestId('vote-box-bar-ends')).toBeNull();
  });

  it('leads with the overall row and lists the spaces under the bar', () => {
    render(<VoteBox split={CONTESTED_SPLIT} control={{ ...control, countSummary: '2,418 votes' }} />);
    // jsdom applies no container queries: drop the phone split line to check the wide layout alone.
    screen.getByTestId('vote-box-phone-split').remove();

    const result = screen.getByTestId('vote-box-result');
    expect(result).toHaveTextContent('52%agree·2,418 votes');
    expect(within(result).queryByText('Community A')).toBeNull();
    const overall = screen.getByRole('meter', { name: 'Everyone agree' });
    const spaceA = screen.getByText('Community A');
    expect(overall.compareDocumentPosition(spaceA) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Community B')).toBeInTheDocument();
    expect(screen.getAllByRole('meter')).toHaveLength(3);
  });

  it('lists every space when no row is the overall one, with the count as the headline', () => {
    render(
      <VoteBox
        split={{ ...CONTESTED_SPLIT, rows: CONTESTED_SPLIT.rows.filter(row => !row.isEveryone) }}
        control={control}
      />
    );
    // jsdom applies no container queries: drop the phone split line to check the wide layout alone.
    screen.getByTestId('vote-box-phone-split').remove();

    const result = screen.getByTestId('vote-box-result');
    expect(result).toHaveTextContent('7 votes');
    expect(screen.queryByTestId('vote-box-empty-bar')).toBeNull();
    expect(screen.getAllByRole('meter')).toHaveLength(2);
  });

  it('keeps a prompt (the News story accuracy rating) above the result and the buttons', () => {
    render(
      <VoteBox
        prompt="This is an accurate account of what happened"
        split={CONTESTED_SPLIT}
        control={{ ...control, countSummary: '2,418 people rated this account' }}
      />
    );
    const box = screen.getByRole('region', { name: 'This is an accurate account of what happened' });
    const prompt = within(box).getByText('This is an accurate account of what happened');
    const result = within(box).getByTestId('vote-box-result');
    expect(prompt.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result).toHaveTextContent('52%agree·2,418 people rated this account');
    expect(within(box).getByRole('button', { name: 'Agree' })).toBeInTheDocument();
  });

  it('says a large, quiet "No votes yet" over an empty bar, buttons still there', () => {
    render(
      <VoteBox
        split={{ rows: [], isSplit: false, totalVotes: 0 }}
        control={{ ...control, countSummary: 'No votes yet' }}
      />
    );
    const result = screen.getByTestId('vote-box-result');
    expect(result).toHaveTextContent('No votes yet');
    expect(within(result).getByText('No votes yet')).toHaveClass('text-[28px]', 'text-grey-04');
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByTestId('vote-box-empty-bar')).toHaveClass('w-full', 'bg-grey-01');
    expect(screen.queryByTestId('vote-box-bar-ends')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeEnabled();
  });
});

describe('ClaimExplorer rows carry no debate count', () => {
  it('drops both the debate count and a "N debates" meta part', () => {
    const claims: ClaimSummaryModel[] = [
      {
        id: 'deb-1',
        title: 'A debated claim',
        split: { rows: [], isSplit: true, totalVotes: 0 },
        debateCount: 5,
        debatesHref: '/debates/x',
        meta: ['3 debates', 'From a source'],
        onVote: vi.fn(),
      },
    ];
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={claims} agreedClaims={[]} />
      </EntityActionProvider>
    );

    expect(screen.queryByText(/\bdebates?\b/)).toBeNull();
    expect(screen.queryByRole('link', { name: /debate/ })).toBeNull();
    expect(screen.getAllByText('From a source').length).toBeGreaterThan(0);
  });
});

describe('ClaimExplorer row layout (GEO-3845)', () => {
  it('puts the kind in the quiet result text beside the vote buttons, after the title', () => {
    const claims: ClaimSummaryModel[] = [
      {
        id: 'kind-1',
        title: 'A judgment claim',
        kind: 'judgment',
        split: {
          rows: [{ id: 'everyone', label: 'Everyone', color: '#000', percent: 71, isEveryone: true }],
          isSplit: true,
          totalVotes: 7,
        },
        onVote: vi.fn(),
      },
    ];
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={claims} agreedClaims={[]} />
      </EntityActionProvider>
    );

    const tag = screen.getByTestId('claim-kind-tag');
    // Plain text, not a chip, and only on wide rows.
    expect(tag).toHaveTextContent('Judgment');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).not.toHaveClass('bg-grey-01');

    const title = screen.getByText('A judgment claim');
    const agree = screen.getByRole('button', { name: 'Agree' });
    // The title comes first, then the buttons, then the result group.
    expect(title.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(agree.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.parentElement).not.toContainElement(tag);

    // The result group holds the short bar, its percentage, the vote count and the kind together,
    // on the same line as the buttons, and is hidden on phones.
    const group = tag.parentElement!;
    expect(group).toHaveClass('hidden', '@[760px]:flex');
    expect(within(group).getByRole('meter')).toHaveAttribute('aria-valuenow', '71');
    expect(group).toHaveTextContent('71%·7 votes·Judgment');
    expect(group.parentElement).toContainElement(agree);
  });

  it('says "No votes yet" beside the buttons when nobody has voted', () => {
    render(
      <EntityActionProvider>
        <ClaimExplorer
          contestedClaims={[
            {
              id: 'kind-2',
              title: 'A fresh claim',
              kind: 'fact',
              split: { rows: [], isSplit: true, totalVotes: 0 },
              onVote: vi.fn(),
            },
          ]}
          agreedClaims={[]}
        />
      </EntityActionProvider>
    );
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByTestId('claim-kind-tag').parentElement).toHaveTextContent('No votes yet·Factual');
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
    expect(screen.queryByText('You agreed.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByText('Counted in Everyone.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
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
  it('puts the title on its own line and the actions on the type row, right of the chips', () => {
    const { container } = render(
      <div>
        <TemplateTitleRow meta={<span>News story</span>} actions={<button type="button">Menu</button>}>
          <h1>A sentence-long news story title</h1>
        </TemplateTitleRow>
      </div>
    );

    const wrapper = container.firstElementChild!;
    const heading = screen.getByRole('heading', { name: 'A sentence-long news story title' });
    const actions = screen.getByRole('button', { name: 'Menu' }).parentElement!;
    const chips = screen.getByText('News story').parentElement!;
    const typeRow = actions.parentElement!;

    // The title is a sibling of the type row, not sharing a line with the actions.
    expect(heading.parentElement).toBe(wrapper);
    expect(typeRow.parentElement).toBe(wrapper);
    expect(chips.parentElement).toBe(typeRow);
    expect(typeRow.firstElementChild).toBe(chips);
    expect(typeRow.lastElementChild).toBe(actions);
    expect(typeRow).toHaveClass('flex', 'items-start', 'justify-between');
    // Chips wrap inside their own column; the actions never shrink and stay one chip line tall.
    expect(chips).toHaveClass('min-w-0', 'flex-1', 'flex-wrap');
    expect(actions).toHaveClass('shrink-0', 'h-7', 'ml-auto');
  });

  it('clips chips that do not fit to keep a single-line row whole', () => {
    render(
      <TemplateTitleRow singleLine meta={<span>Topic</span>} actions={<button type="button">Menu</button>}>
        <h1>Israel-Gaza war</h1>
      </TemplateTitleRow>
    );

    const chips = screen.getByText('Topic').parentElement!;
    expect(chips).toHaveClass('flex-wrap', 'h-7', 'overflow-hidden');
    expect(screen.getByRole('button', { name: 'Menu' }).parentElement).toHaveClass('shrink-0');
  });

  it('gives the actions their own right-aligned row when there are no chips', () => {
    render(
      <TemplateTitleRow actions={<button type="button">Menu</button>}>
        <h1>Untyped</h1>
      </TemplateTitleRow>
    );

    const actions = screen.getByRole('button', { name: 'Menu' }).parentElement!;
    expect(actions.parentElement!.children).toHaveLength(1);
    expect(actions).toHaveClass('ml-auto');
  });
});

describe('TemplateBreadcrumb layout', () => {
  it('keeps the trail on one line, with ancestors truncating before the current page', () => {
    render(
      <TemplateBreadcrumb
        items={[
          { id: 'space', label: 'A long parent space name', href: '/space/a' },
          { id: 'claim', label: 'Current claim' },
        ]}
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).not.toHaveClass('flex-wrap');
    expect(screen.getByRole('link', { name: 'A long parent space name' })).toHaveClass(
      'truncate',
      'min-w-0',
      '@[600px]:max-w-[45%]'
    );
    expect(screen.getByText('Current claim')).toHaveClass('truncate', 'flex-1', 'basis-0', 'min-w-[40%]');
    expect(nav.querySelector('svg')).toHaveClass('shrink-0');
  });

  it('shows only the parent, as a back link, on phones', () => {
    render(
      <TemplateBreadcrumb
        items={[
          { id: 'root', label: 'Geo', href: '/space/root' },
          { id: 'mid', label: 'World Affairs', href: '/space/mid' },
          { id: 'parent', label: 'Wars & conflicts', href: '/space/parent' },
          { id: 'page', label: 'Israel-Gaza war' },
        ]}
      />
    );

    // The parent stays visible at every width, without the desktop 45% cap.
    const parent = screen.getByRole('link', { name: 'Wars & conflicts' });
    expect(parent).not.toHaveClass('hidden');
    expect(parent).not.toHaveClass('max-w-[45%]');
    // Every other crumb, including the current page, is desktop-only.
    for (const name of ['Geo', 'World Affairs']) {
      expect(screen.getByRole('link', { name })).toHaveClass('hidden', '@[600px]:block');
    }
    expect(screen.getByText('Israel-Gaza war')).toHaveClass('hidden', '@[600px]:block');
    // One back chevron for phones, the desktop separators hidden there.
    const svgs = Array.from(screen.getByRole('navigation', { name: 'Breadcrumb' }).querySelectorAll('svg'));
    expect(svgs.filter(svg => svg.classList.contains('@[600px]:hidden'))).toHaveLength(1);
    expect(svgs.filter(svg => svg.classList.contains('@[600px]:block'))).toHaveLength(3);
  });
});

describe('Context & Disputes empty states, inline pill +, and pagination', () => {
  // The add flows below run with the actions switched on; the defaults hide them (GEO-3819).
  beforeEach(() => {
    TEMPLATE_ACTIONS.addContext = true;
    TEMPLATE_ACTIONS.dispute = true;
  });
  afterEach(restoreTemplateActions);

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

    expect(screen.getByText('No properties added yet.')).toBeInTheDocument();
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
  const RANKING_CLAIMS: ClaimSummaryModel[] = [
    { id: 'rank-c1', title: 'First global claim', kind: 'fact', split: { rows: [], isSplit: true, totalVotes: 20 } },
    {
      id: 'rank-c2',
      title: 'Second global claim',
      kind: 'judgment',
      split: { rows: [], isSplit: true, totalVotes: 12 },
    },
    { id: 'rank-c3', title: 'Third global claim', kind: 'fact', split: { rows: [], isSplit: true, totalVotes: 4 } },
  ];

  beforeEach(() => {
    flagMocks.templateListRanking = true;
  });
  afterEach(() => {
    flagMocks.templateListRanking = false;
  });

  it('hides the ranking control and ignores a saved ranking while templateListRanking is off', () => {
    window.localStorage.clear();
    // Save a personal ranking with the flag on, so this browser holds one.
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={RANKING_CLAIMS} agreedClaims={[]} />
      </EntityActionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rank Claims' }));
    const dialog = screen.getByRole('dialog', { name: 'Rank Claims' });
    const globalSection = within(dialog).getByRole('region', { name: 'Global ranking' });
    fireEvent.click(within(globalSection).getByRole('button', { name: 'Add Third global claim to my ranking' }));
    fireEvent.click(
      within(within(dialog).getByRole('region', { name: 'My ranking' })).getByRole('button', {
        name: 'Publish ranking',
      })
    );
    cleanup();

    flagMocks.templateListRanking = false;
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={RANKING_CLAIMS} agreedClaims={[]} />
      </EntityActionProvider>
    );

    expect(screen.queryByRole('button', { name: /Rank Claims|Edit my ranking/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'My ranking' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add claim' })).toBeInTheDocument();
    const first = screen.getByText('First global claim');
    const third = screen.getByText('Third global claim');
    expect(first.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

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

describe('EntityOverflowMenu trigger', () => {
  it('widens the small "..." tap target to 32px without changing its 28px look (GEO-3824)', () => {
    render(
      <EntityActionProvider>
        <EntityOverflowMenu target={{ id: 'root-sm', kind: 'Topic', title: 'Small' }} isPageRoot />
        <EntityOverflowMenu target={{ id: 'root-md', kind: 'Topic', title: 'Medium' }} isPageRoot size="md" />
      </EntityActionProvider>
    );

    const small = screen.getByRole('button', { name: 'More actions for Small' });
    expect(small).toHaveClass('size-7', 'relative', 'after:absolute', 'after:-inset-0.5');
    const medium = screen.getByRole('button', { name: 'More actions for Medium' });
    expect(medium).toHaveClass('size-8');
    expect(medium).not.toHaveClass('after:-inset-0.5');
  });
});

describe('Add context and Dispute switch (GEO-3819)', () => {
  const target = { id: 'e-off', kind: 'Claim', title: 'Switched-off claim' };
  const groups = [{ predicate: 'Related actors', items: [{ id: 'i-1', label: 'UN OCHA', kind: 'entity' as const }] }];

  afterEach(restoreTemplateActions);

  it('drops the overflow menu items, and the trigger when nothing is left in the menu', () => {
    render(
      <EntityActionProvider>
        <EntityOverflowMenu target={target} />
        <EntityOverflowMenu target={{ id: 'root', kind: 'Topic', title: 'Page root' }} isPageRoot />
      </EntityActionProvider>
    );

    // A row with no context of its own: the menu would be empty, so there is no "..." at all.
    expect(screen.queryByRole('button', { name: `More actions for ${target.title}` })).toBeNull();

    // The page root keeps its read-only "Show all context" toggle, without the write actions.
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Page root' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Show all context')).toBeInTheDocument();
    expect(within(menu).queryByText('Add context')).toBeNull();
    expect(within(menu).queryByText('Dispute')).toBeNull();
  });

  it('shows Add context and Dispute in the menu again when switched on', () => {
    TEMPLATE_ACTIONS.addContext = true;
    TEMPLATE_ACTIONS.dispute = true;
    render(
      <EntityActionProvider>
        <EntityOverflowMenu target={target} />
      </EntityActionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: `More actions for ${target.title}` }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Add context')).toBeInTheDocument();
    expect(within(menu).getByText('Dispute')).toBeInTheDocument();
  });

  it('renders no empty Disputes or Context section, and no add pill inside Context', () => {
    const { rerender } = render(
      <EntityActionProvider>
        <GraphConnectionsStrip groups={[]} target={target} />
        <EntityFlagsSection target={target} />
      </EntityActionProvider>
    );
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Disputes' })).toBeNull();

    rerender(
      <EntityActionProvider>
        <GraphConnectionsStrip groups={groups} target={target} />
      </EntityActionProvider>
    );
    const context = screen.getByRole('region', { name: 'Properties' });
    expect(within(context).getByText('UN OCHA')).toBeInTheDocument();
    expect(within(context).queryByRole('button', { name: 'Add context' })).toBeNull();
    expect(within(context).queryByRole('button', { name: 'Add Related actors' })).toBeNull();
  });

  it('keeps the add pill inside Context when Add context is on', () => {
    TEMPLATE_ACTIONS.addContext = true;
    render(
      <EntityActionProvider>
        <GraphConnectionsStrip groups={groups} target={target} />
      </EntityActionProvider>
    );
    expect(screen.getByRole('button', { name: 'Add Related actors' })).toBeInTheDocument();
  });

  it('leaves no empty Context & Disputes row behind to add a blank gap to the page', () => {
    const { container } = render(
      <EntityActionProvider>
        <EntityContextAndDisputes groups={[]} target={target} />
      </EntityActionProvider>
    );
    const row = container.querySelector('.grid') as HTMLElement;
    expect(row).toBeEmptyDOMElement();
    // jsdom applies no Tailwind, so check the class that hides it (`:empty { display: none }`).
    expect(row).toHaveClass('empty:hidden');
  });
});

describe('Add claim on a live page (GEO-3836)', () => {
  const listed: ClaimSummaryModel[] = [
    { id: 'listed-c1', title: 'A listed claim', kind: 'fact', split: { rows: [], isSplit: true, totalVotes: 3 } },
  ];

  function submitClaim(title: string) {
    fireEvent.change(screen.getByPlaceholderText(/Write a clear, testable statement/), { target: { value: title } });
    fireEvent.submit(
      screen.getByPlaceholderText(/Write a clear, testable statement/).closest('form') as HTMLFormElement
    );
  }

  it('keeps the form shut when the page says no (signed out)', () => {
    const canOpenAddForm = vi.fn(() => false);
    render(
      <EntityActionProvider callbacks={{ canOpenAddForm, onAddClaim: vi.fn() }}>
        <ClaimExplorer contestedClaims={listed} agreedClaims={[]} />
      </EntityActionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    expect(canOpenAddForm).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/Write a clear, testable statement/)).toBeNull();
  });

  it('shows the claim as publishing, then as the published entity, and drops it on a failed publish', async () => {
    let settle!: (result: { ok: true; id: string; spaceId: string } | { ok: false; error: string }) => void;
    const onAddClaim = vi.fn(() => new Promise<never>(resolve => (settle = resolve as never)));
    render(
      <EntityActionProvider callbacks={{ canOpenAddForm: () => true, onAddClaim }}>
        <ClaimExplorer contestedClaims={listed} agreedClaims={[]} />
      </EntityActionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    submitClaim('Aid entered on Monday');
    expect(onAddClaim).toHaveBeenCalledWith({ title: 'Aid entered on Monday', kind: 'fact', note: undefined });
    expect(screen.getByText('Aid entered on Monday')).toBeInTheDocument();
    expect(screen.getAllByText('Publishing…').length).toBeGreaterThan(0);

    await React.act(async () =>
      settle({ ok: true, id: 'cccccccccccccccccccccccccccccccc', spaceId: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' })
    );
    expect(screen.queryByText('Publishing…')).toBeNull();
    expect(screen.getByRole('link', { name: 'Aid entered on Monday' })).toHaveAttribute(
      'href',
      expect.stringContaining('cccccccccccccccccccccccccccccccc')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    submitClaim('This one will fail');
    expect(screen.getByText('This one will fail')).toBeInTheDocument();
    await React.act(async () => settle({ ok: false, error: 'Could not publish.' }));
    expect(screen.queryByText('This one will fail')).toBeNull();
  });
});

describe('Context drawer dispute votes (GEO-3845)', () => {
  it("draw the debates app's Agree / Disagree, and pressing the held side takes the vote back", () => {
    render(
      <EntityActionProvider>
        <ContextPeekDrawer
          item={{
            id: 'peek-1',
            kind: 'source',
            kindLabel: 'Source',
            title: 'A report',
            flags: [{ id: 'flag-1', reason: 'Misleading', body: 'The figure is from 2019.' }],
          }}
          onClose={() => {}}
        />
      </EntityActionProvider>
    );
    const group = screen.getByRole('group', { name: 'Vote on dispute' });
    const agree = within(group).getByRole('button', { name: 'Agree' });
    expect(agree).toHaveClass('border-[#8a8a8a]');
    fireEvent.click(agree);
    expect(agree).toHaveAttribute('aria-pressed', 'true');
    expect(agree).toHaveClass('border-[#151515]');
    expect(agree).not.toHaveClass('bg-text');
    fireEvent.click(agree);
    expect(agree).toHaveAttribute('aria-pressed', 'false');
  });
});
