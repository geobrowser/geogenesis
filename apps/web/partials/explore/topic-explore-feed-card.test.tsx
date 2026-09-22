import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';

import { TopicExploreFeedCard } from './topic-explore-feed-card';

// The card's job here is the metadata line and the layout around it. The meta row, the title link
// and the vote/comment row all have their own suites and all reach the network.
vi.mock('./explore-meta-row', () => ({
  META_SEGMENT_CLASS: 'meta-segment',
  ExploreMetaRow: (props: Record<string, unknown>) => (
    <div data-testid="meta-row" data-hide-join={String(props.hideJoinButton)} />
  ),
}));

vi.mock('./explore-card-title', () => ({
  ExploreCardTitle: (props: { item: ExploreFeedItem; opensSidePanel: boolean }) => (
    <h2 data-testid="title" data-opens-panel={String(props.opensSidePanel)}>
      {props.item.title}
    </h2>
  ),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: (props: { children?: React.ReactNode }) => <div data-testid="actions">{props.children}</div>,
}));

const item = (overrides: Partial<ExploreFeedItem> = {}): ExploreFeedItem => ({
  entityId: 'topic-1',
  spaceId: 'space-1',
  spaceName: 'Space One',
  spaceImage: null,
  types: [{ id: 'topic-type', name: 'Topic' }],
  createdAtSec: 0,
  title: 'AI Safety',
  description: 'Preventing harm from advanced AI systems.',
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: null,
  commentCount: 0,
  isMemberOrEditor: false,
  hasPendingMembershipRequest: false,
  ...overrides,
});

afterEach(cleanup);

describe('TopicExploreFeedCard', () => {
  it('names every attached kind, with thousands separated', () => {
    render(<TopicExploreFeedCard item={item()} counts={{ claims: 1170, news: 2, debates: 3, total: 1175 }} />);

    expect(screen.getByText(/1,170/)).toBeInTheDocument();
    expect(screen.getByText(/claims/)).toBeInTheDocument();
    expect(screen.getByText(/news stories/)).toBeInTheDocument();
    expect(screen.getByText(/debates/)).toBeInTheDocument();
  });

  it('leads with debates, then claims, then news stories', () => {
    const { container } = render(
      <TopicExploreFeedCard
        item={item({ description: null })}
        counts={{ claims: 117, news: 2, debates: 3, total: 122 }}
      />
    );

    // The only paragraph on a card with no description is the metadata line. The dots carry their
    // spacing as margins rather than as whitespace, so they sit flush in `textContent`.
    expect(container.querySelector('p')?.textContent).toBe('3 debates·117 claims·2 news stories');
  });

  it('agrees with the count', () => {
    render(<TopicExploreFeedCard item={item()} counts={{ claims: 1, news: 1, debates: 1, total: 3 }} />);

    expect(screen.getByText(/claim$/)).toBeInTheDocument();
    expect(screen.getByText(/news story$/)).toBeInTheDocument();
    expect(screen.getByText(/debate$/)).toBeInTheDocument();
  });

  it('leaves out the kinds a topic has none of', () => {
    render(<TopicExploreFeedCard item={item()} counts={{ claims: 12, news: 0, debates: 0, total: 12 }} />);

    expect(screen.getByText(/claims/)).toBeInTheDocument();
    expect(screen.queryByText(/news/)).toBeNull();
    expect(screen.queryByText(/debate/)).toBeNull();
  });

  it('names the kinds it measured rather than claiming a topic is empty', () => {
    // A topic also carries episodes, tweets and posts, which this card never counts — so "nothing
    // attached" would be a claim about buckets it did not measure.
    render(<TopicExploreFeedCard item={item()} counts={{ claims: 0, news: 0, debates: 0, total: 0 }} />);

    expect(screen.getByText('No debates, claims or news stories yet')).toBeInTheDocument();
    expect(screen.queryByText('Nothing attached yet')).toBeNull();
  });

  it('draws no metadata at all when the count could not be read', () => {
    // A failed count is not a count of zero, and a card must not say it was.
    render(<TopicExploreFeedCard item={item()} counts={null} />);

    expect(screen.queryByText('Nothing attached yet')).toBeNull();
    expect(screen.queryByText(/claim/)).toBeNull();
  });

  it('keeps the generic card around the new line', () => {
    render(
      <TopicExploreFeedCard
        item={item()}
        counts={{ claims: 3, news: 0, debates: 0, total: 3 }}
        titleOpensSidePanel
        hideJoinButton
      />
    );

    expect(screen.getByTestId('meta-row')).toHaveAttribute('data-hide-join', 'true');
    expect(screen.getByTestId('title')).toHaveAttribute('data-opens-panel', 'true');
    expect(screen.getByText('Preventing harm from advanced AI systems.')).toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  it('draws the thumbnail well only for a topic with a picture', () => {
    // The exact entity href, not a prefix: the comment link points at the same entity with a
    // `#entity-comments` fragment and is always drawn.
    const thumbnail = 'a[href="/space/space-1/topic-1"]';

    const { container, rerender } = render(<TopicExploreFeedCard item={item()} counts={null} />);
    expect(container.querySelector(thumbnail)).toBeNull();

    rerender(<TopicExploreFeedCard item={item({ imageUrl: 'https://example.test/t.png' })} counts={null} />);
    expect(container.querySelector(thumbnail)).not.toBeNull();
  });
});
