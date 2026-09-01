import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entity: {
    id: 'topic-1',
    name: 'Renewable energy',
    description: 'A topic description.',
    relations: [],
    types: [],
  } as Record<string, unknown> | null,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

vi.mock('./use-topic-ancestors', () => ({ useTopicAncestors: () => ({ ancestors: [], isLoading: false }) }));

// The distribution strip is the last thing shared across tabs; everything after it is this topic's
// own Overview content. Each is identified so its position relative to the bar is assertable.
vi.mock('./topic-composition', () => ({ TopicComposition: () => <div data-testid="topic-composition" /> }));
vi.mock('./topic-debates', () => ({ TopicDebates: () => <div data-testid="topic-debates" /> }));
vi.mock('./topic-claims', () => ({ TopicClaims: () => <div data-testid="topic-claims" /> }));
vi.mock('./topic-coverage', () => ({ TopicCoverage: () => <div data-testid="topic-coverage" /> }));
vi.mock('~/partials/comments/comments-section', () => ({
  CommentSection: () => <div data-testid="topic-comments" />,
}));

const { TopicPageView } = await import('./topic-page-view');

const slot = (body: React.ReactNode | null) => ({ bar: <div data-testid="tab-bar" />, body });

const isBefore = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(cleanup);

/**
 * The bar sits under the distribution strip, not above the page: what is above it says which topic
 * this is and how it is made up, and that holds whichever tab is open (GEO-2779).
 */
describe('TopicPageView tabs', () => {
  it('renders exactly as before when the entity has no other tabs', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" tabs={{ bar: null, body: null }} />);

    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('topic-composition')).toBeInTheDocument();
    expect(screen.getByTestId('topic-debates')).toBeInTheDocument();
    expect(screen.getByTestId('topic-comments')).toBeInTheDocument();
  });

  it('places the bar below the distribution strip and above the Overview content', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" tabs={slot(null)} />);

    const bar = screen.getByTestId('tab-bar');
    expect(isBefore(screen.getByTestId('topic-composition'), bar)).toBe(true);
    expect(isBefore(bar, screen.getByTestId('topic-debates'))).toBe(true);
  });

  it("swaps the Overview content for the selected tab's blocks, keeping what is above the bar", () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" tabs={slot(<div data-testid="tab-blocks" />)} />);

    expect(screen.getByTestId('tab-blocks')).toBeInTheDocument();
    // The name and the strip describe the topic, so they hold across tabs.
    expect(screen.getByText('Renewable energy')).toBeInTheDocument();
    expect(screen.getByTestId('topic-composition')).toBeInTheDocument();
    for (const belowTheSeam of ['topic-debates', 'topic-claims', 'topic-coverage', 'topic-comments']) {
      expect(screen.queryByTestId(belowTheSeam)).not.toBeInTheDocument();
    }
  });
});
