import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicPageView } from './topic-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /**
   * Deliberately not 3.
   *
   * Asserting against the real constant proves nothing: its value is 3, so a page that wrote
   * `maxLines={3}` — the duplication the shared constant exists to prevent — would satisfy it just
   * as well. Stubbing the module to a value the page could not have arrived at on its own is what
   * makes the assertion about where the number came from rather than what it happens to be.
   */
  maxLines: 5,
}));

vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  ENTITY_DESCRIPTION_MAX_LINES: mocks.maxLines,
}));

// jsdom has no layout, so the real clamp can never measure an overflow. What this file is about is
// that the description is handed to it at all, and with the shared line budget — the measuring
// itself belongs to `ClampedText`.
vi.mock('~/design-system/clamped-text', () => ({
  ClampedText: (props: Record<string, unknown>) => {
    mocks.clamp = props;
    return <p data-testid="clamped-description">{props.text as string}</p>;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

// The page's modules each reach for the sync engine or geo-chat. None is what this file asserts,
// and the header renders above all of them.
vi.mock('./use-topic-ancestors', () => ({ useTopicAncestors: () => [] }));
vi.mock('./topic-composition', () => ({ TopicComposition: () => <div data-testid="topic-composition" /> }));
vi.mock('./topic-debates', () => ({ TopicDebates: () => <div data-testid="topic-debates" /> }));
vi.mock('./topic-claims', () => ({ TopicClaims: () => <div data-testid="topic-claims" /> }));
vi.mock('./topic-coverage', () => ({ TopicCoverage: () => <div data-testid="topic-coverage" /> }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => <div data-testid="topic-comments" /> }));

function topicEntity(description: string | null) {
  return {
    id: 'topic-1',
    name: 'Artificial intelligence',
    description,
    relations: [],
    types: [],
    spaces: [],
  };
}

beforeEach(() => {
  mocks.entity = topicEntity('A description long enough that the page has something to collapse.');
  mocks.clamp = null;
});

afterEach(cleanup);

describe('TopicPageView description', () => {
  // GEO-2776. It used to be a plain paragraph, so a long description pushed the composition, the
  // subtopics and everything under them off the first screen — worst in the side panel, which
  // renders this same view at a much narrower width.
  it('clamps the description instead of printing it in full', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('clamped-description')).toHaveTextContent(
      'A description long enough that the page has something to collapse.'
    );
  });

  // The number lives with the entity-page component and is imported here. Restating `3` on this
  // surface is what would let the surfaces drift apart after a change to any of them — so the
  // module is stubbed to a different number, and the page has to follow it.
  it('takes its line budget from the shared constant rather than restating it', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(mocks.clamp?.maxLines).toBe(mocks.maxLines);
  });

  it('renders no description block when the topic has none', () => {
    mocks.entity = topicEntity(null);
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.queryByTestId('clamped-description')).toBeNull();
  });
});

/**
 * The bar sits under the distribution strip, not above the page: what is above it says which topic
 * this is and how it is made up, and that holds whichever tab is open (GEO-2779).
 */
describe('TopicPageView tabs', () => {
  const slot = (body: React.ReactNode | null) => ({ bar: <div data-testid="tab-bar" />, body });

  const isBefore = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

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
    // The name, the description and the strip describe the topic, so they hold across tabs.
    expect(screen.getByText('Artificial intelligence')).toBeInTheDocument();
    expect(screen.getByTestId('clamped-description')).toBeInTheDocument();
    expect(screen.getByTestId('topic-composition')).toBeInTheDocument();
    for (const belowTheSeam of ['topic-debates', 'topic-claims', 'topic-coverage', 'topic-comments']) {
      expect(screen.queryByTestId(belowTheSeam)).not.toBeInTheDocument();
    }
  });
});
