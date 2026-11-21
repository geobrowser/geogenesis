import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ClaimSummaryModel,
  type EntityListSectionModel,
  type SplitBreakdown,
  computeSplitGap,
  isClaimSplit,
} from '../models';
import { ClaimSummaryCard, RelatedListSection, SourceChipList, SplitBars, TemplateBreadcrumb, VoteBox } from './index';

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
    expect(screen.getByText('88 pts apart')).toBeInTheDocument();
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
