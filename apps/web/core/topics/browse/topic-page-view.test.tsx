import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';

import { TopicPageView } from './topic-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /** Props the chip section received, or null if the page rendered none. */
  chipSection: null as Record<string, unknown> | null,
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

// The section moved out of this file in GEO-2781 and is shared with the claim view. Its own suite
// covers the chips and the expander; this only checks that subtopics still reach it unchanged.
vi.mock('~/partials/entity-page/relation-chip-section', () => ({
  META_CHIP_CLASS: 'meta-chip',
  RelationChipSection: (props: Record<string, unknown>) => {
    mocks.chipSection = props;
    return <div data-testid="chip-section" data-label={props.label as string} />;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

// The page's modules each reach for the sync engine or geo-chat. None is what this file asserts,
// and the header renders above all of them.
vi.mock('./use-topic-ancestors', () => ({ useTopicAncestors: () => [] }));
vi.mock('./topic-composition', () => ({ TopicComposition: () => null }));
vi.mock('./topic-debates', () => ({ TopicDebates: () => null }));
vi.mock('./topic-claims', () => ({ TopicClaims: () => null }));
vi.mock('./topic-coverage', () => ({ TopicCoverage: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => null }));

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
  mocks.chipSection = null;
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

// GEO-2781 lifted this section out of this file so the claim view could draw its Topics with it.
// Extracting a component is where a caller quietly loses an argument, so the subtopics side is
// pinned too rather than only the new one.
describe('TopicPageView subtopics', () => {
  const subtopicRelation = {
    id: 'relation-1',
    type: { id: SUBTOPIC_RELATION_TYPE_ID },
    toEntity: { id: 'subtopic-1', name: 'Alignment' },
  };

  it('still draws them with the shared chip section, under the label Subtopics', () => {
    mocks.entity = { ...topicEntity('Anything'), relations: [subtopicRelation] };
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('chip-section')).toHaveAttribute('data-label', 'Subtopics');
    expect(mocks.chipSection?.relations).toEqual([subtopicRelation]);
    expect(mocks.chipSection?.spaceId).toBe('space-1');
  });
});
