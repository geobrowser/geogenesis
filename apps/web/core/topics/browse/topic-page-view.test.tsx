import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';

import { ENTITY_PAGE_CONTENT_MAX_WIDTH } from '~/partials/entity-page/entity-page-layout';

import { TOPIC_PAGE_CONTENT_MAX_WIDTH, TopicPageView, resolveTopicTab } from './topic-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /** Props the chip section received, or null if the page rendered none. */
  feed: null as Record<string, unknown> | null,
  comments: null as Record<string, unknown> | null,
  composition: null as Record<string, unknown> | null,
  tabs: null as Record<string, unknown> | null,
  pathname: '/space/space-1/topic-1',
  /**
   * Deliberately not 3.
   *
   * Asserting against the real constant proves nothing: its value is 3, so a page that wrote
   * `maxLines={3}` — the duplication the shared constant exists to prevent — would satisfy it just
   * as well. Stubbing the module to a value the page could not have arrived at on its own is what
   * makes the assertion about where the number came from rather than what it happens to be.
   */
  maxLines: 5,
  topicSpaceIds: ['11111111111111111111111111111111'],
  /** Props the editable Types group received, or null if the page rendered none. */
  typesEditor: null as Record<string, unknown> | null,
  /** The topic's own block relations — what the Overview tab would have to draw. */
  blocks: [] as unknown[],
  canEdit: true,
  /** Props the votes/history/menu cluster received, or null if the page rendered none. */
  pageActions: null as Record<string, unknown> | null,
}));

vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  ENTITY_DESCRIPTION_MAX_LINES: mocks.maxLines,
  EntityPageInlineDescription: () => <div data-testid="editable-description" />,
}));
vi.mock('~/partials/entity-page/editable-entity-header', () => ({
  EditableHeading: () => <div data-testid="editable-heading" />,
}));
vi.mock('~/partials/entity-page/editable-entity-page', () => ({
  RelationsGroup: (props: Record<string, unknown>) => {
    mocks.typesEditor = props;
    return <div data-testid="types-editor" />;
  },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('~/core/hooks/use-entity-comment-count', () => ({
  useEntityCommentCount: () => ({ count: 7, isLoading: false }),
}));
vi.mock('~/partials/entity-page/entity-tabs', () => ({
  EntityTabs: (props: Record<string, unknown>) => {
    mocks.tabs = props;
    return <div data-testid="entity-tabs" />;
  },
}));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => <div data-testid="editor" /> }));

// jsdom has no layout, so the real clamp can never measure an overflow. What this file is about is
// that the description is handed to it at all, and with the shared line budget — the measuring
// itself belongs to `ClampedText`.
vi.mock('~/design-system/clamped-text', () => ({
  ClampedText: (props: Record<string, unknown>) => {
    mocks.clamp = props;
    return <p data-testid="clamped-description">{props.text as string}</p>;
  },
}));

vi.mock('~/partials/entity-page/relation-chip-section', () => ({
  META_CHIP_CLASS: 'meta-chip',
}));
vi.mock('./topic-feed', () => ({
  TopicFeed: (props: Record<string, unknown>) => {
    mocks.feed = props;
    return <div data-testid="topic-feed" />;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

// The page asks the same question the editor does — "would this draw anything?" — through the same
// hook, so the tests drive the answer rather than the sync store behind it.
vi.mock('~/core/state/editor/use-blocks', () => ({
  useBlocks: () => mocks.blocks,
}));
vi.mock('~/core/hooks/use-user-is-editing', () => ({
  useCanUserEdit: () => mocks.canEdit,
  useUserIsEditing: () => false,
}));
// Votes, history and the overflow menu each reach for the sync engine and the wallet. What this
// file asserts is that the topic header hands them this entity at all.
vi.mock('~/partials/entity-page/entity-page-actions', () => ({
  EntityPageActions: (props: Record<string, unknown>) => {
    mocks.pageActions = props;
    return <div data-testid="entity-page-actions" />;
  },
}));

// The page's modules each reach for the sync engine or geo-chat. None is what this file asserts,
// and the header renders above all of them.
vi.mock('./use-topic-ancestors', () => ({ useTopicAncestors: () => [] }));
vi.mock('../use-topic-space-scope', () => ({
  useTopicSpaceScope: () => mocks.topicSpaceIds,
}));
vi.mock('./topic-composition', () => ({
  TopicComposition: (props: Record<string, unknown>) => {
    mocks.composition = props;
    return <div data-testid="topic-composition" />;
  },
}));
vi.mock('~/partials/comments/comments-section', () => ({
  CommentSection: (props: Record<string, unknown>) => {
    mocks.comments = props;
    return <div data-testid="comments" />;
  },
}));

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
  mocks.feed = null;
  mocks.comments = null;
  mocks.composition = null;
  mocks.tabs = null;
  mocks.pathname = '/space/space-1/topic-1';
  mocks.topicSpaceIds = ['11111111111111111111111111111111'];
  mocks.typesEditor = null;
  mocks.blocks = [];
  mocks.canEdit = true;
  mocks.pageActions = null;
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
 * GEO-2460 gave entity and space titles their own responsive token. On master this view and the
 * entity header both used `mainPage`, so they matched; moving only the entity header would have
 * shipped the same route drawing the same slot at two sizes depending on whether the entity
 * happened to be typed as a Topic. This keeps them on one token instead.
 *
 * Asserted as the token rather than as sizes: the 44/36/26 steps live in `styles.css` and jsdom
 * applies no stylesheet, so a size assertion here would only restate the class anyway.
 */
describe('TopicPageView title', () => {
  it('shares the entity title token rather than the section-heading one', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('Artificial intelligence');
    expect(title).toHaveClass('text-entityTitle');
    expect(title).not.toHaveClass('text-mainPage');
  });
});

describe('TopicPageView explore feed', () => {
  it('renders one mixed feed whose filters are derived from that feed', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('topic-feed')).toBeInTheDocument();
    expect(mocks.feed).toMatchObject({
      topicId: 'topic-1',
      spaceId: 'space-1',
      spaceIds: ['11111111111111111111111111111111'],
    });
    expect(mocks.feed).not.toHaveProperty('topicOptions');
  });

  it('keeps the route space when the curated scope exceeds its request cap', () => {
    const routeSpaceId = 'ffffffffffffffffffffffffffffffff';
    mocks.topicSpaceIds = [
      ...Array.from({ length: 100 }, (_, index) => (index + 1).toString(16).padStart(32, '0')),
      routeSpaceId,
    ];

    render(<TopicPageView entityId="topic-1" spaceId={routeSpaceId} />);

    expect(mocks.feed?.spaceIds).toHaveLength(100);
    expect(mocks.feed?.spaceIds).toContain(routeSpaceId);
    expect(mocks.composition?.spaceIds).toEqual(mocks.feed?.spaceIds);
  });

  it('keeps Explore and counted Comments as built-in tabs so authored tabs can follow them', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(mocks.tabs?.systemTabsBefore).toEqual([
      { label: 'Explore', href: '/space/space-1/topic-1', sidePanelKey: 'overview' },
      {
        label: 'Comments',
        href: '/space/space-1/topic-1/comments',
        sidePanelKey: 'comments',
        badge: '7',
      },
    ]);
    expect(mocks.tabs?.reservedSystemLabels).toEqual(['Explore', 'Comments']);
  });

  it('keeps comments out of Explore and renders them only on the Comments tab', () => {
    const { rerender } = render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('topic-feed')).toBeInTheDocument();
    expect(screen.queryByTestId('comments')).toBeNull();

    mocks.pathname = '/space/space-1/topic-1/comments';
    rerender(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('comments')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-feed')).toBeNull();
    expect(mocks.comments).toMatchObject({ entityId: 'topic-1', spaceId: 'space-1', variant: 'tab' });
  });
});

describe('TopicPageView composition', () => {
  it('renders the entity distribution bar in the topic header', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    const composition = screen.getByTestId('topic-composition');
    expect(composition.closest('header')).not.toBeNull();
    expect(mocks.composition).toEqual({
      topicId: 'topic-1',
      spaceId: 'space-1',
      spaceIds: ['11111111111111111111111111111111'],
    });
  });
});

/**
 * A topic's types used to be a literal `<span>Topic</span>` in both modes, so there was no way to
 * add a type to a topic or take one off it — not on this page, and not in the edit-mode property
 * sheet either, which drops `Types` as a system property "editable elsewhere". Edit mode now hands
 * the row to the same `RelationsGroup` the generic metadata header uses, chips, X and all.
 */
describe('TopicPageView types', () => {
  it('prints the type as a plain chip while browsing', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByText('Topic')).toBeInTheDocument();
    expect(screen.queryByTestId('types-editor')).toBeNull();
  });

  it('swaps that chip for the editable Types relations in edit mode', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(screen.getByTestId('types-editor')).toBeInTheDocument();
    // The literal is gone, not merely joined: leaving it in would draw an undeletable "Topic"
    // beside the real, deletable one.
    expect(screen.queryByText('Topic')).toBeNull();
  });

  // The same property the generic header edits, on the entity the page is actually showing — a
  // group pointed at the wrong id or property would render an empty picker that silently writes
  // relations somewhere else.
  it("points that editor at this entity's Types property", () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(mocks.typesEditor).toEqual({
      id: 'topic-1',
      spaceId: 'space-1',
      propertyId: SystemIds.TYPES_PROPERTY,
    });
  });

  // A topic typed as something else too read as a plain Topic, because the row was one literal.
  // Edit mode showed those types and browse mode did not, which is the drift this closes.
  it("lists the topic's other types beside the Topic chip while browsing", () => {
    mocks.entity = {
      ...topicEntity('A description.'),
      types: [
        { id: TOPIC_TYPE_ID, name: 'Topic' },
        { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Project' },
      ],
    };

    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByText('Topic')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
  });

  // Drawn from the literal, not from the list, so the word the page is named for is there before
  // the type entity's own name resolves — and is never doubled when it does.
  it('draws Topic once even though the type list also holds it', () => {
    mocks.entity = { ...topicEntity('A description.'), types: [{ id: TOPIC_TYPE_ID, name: 'Topic' }] };

    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getAllByText('Topic')).toHaveLength(1);
  });

  it('keeps the curated chip alongside the editor', () => {
    mocks.entity = {
      ...topicEntity('A description.'),
      relations: [
        {
          isDeleted: false,
          type: { id: TAG_PROPERTY_ID },
          toEntity: { id: CURATED_TOPIC_TAG_ID },
        },
      ],
    };

    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(screen.getByTestId('types-editor')).toBeInTheDocument();
    expect(screen.getByText('Curated')).toBeInTheDocument();
  });
});

/**
 * A topic page draws the explore feed at its bare URL, so the entity's own block content — the
 * thing every other entity calls Overview — had no tab and no route. Anything written into a
 * topic's body was invisible from the topic view, and there was no way to start one.
 */
/**
 * The topic view replaces the generic entity page on a topic's own route, so anything the generic
 * page carries and this one drops is simply gone for topics. Two things were: the column's width,
 * and the entity's own controls.
 */
describe('TopicPageView parity with the generic entity page', () => {
  // Asserted against the entity page's constant rather than against 900 — the point is that the
  // two columns are one number, not that the number happens to be 900 today.
  it('takes its column width from the entity page rather than setting its own', () => {
    expect(TOPIC_PAGE_CONTENT_MAX_WIDTH).toBe(ENTITY_PAGE_CONTENT_MAX_WIDTH);
  });

  it('renders votes, history and the overflow menu for the topic entity', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('entity-page-actions')).toBeInTheDocument();
    expect(mocks.pageActions).toMatchObject({ entityId: 'topic-1', spaceId: 'space-1', isVoteable: true });
  });

  it('keeps them in the header, beside the types, where the entity page puts them', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    const actions = screen.getByTestId('entity-page-actions');
    expect(actions.closest('header')).not.toBeNull();
    // Same row as the type chips, not a line of its own.
    expect(actions.parentElement?.textContent).toContain('Topic');
  });

  it('keeps them in edit mode, where the types turn into an editor', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(screen.getByTestId('entity-page-actions')).toBeInTheDocument();
    expect(screen.getByTestId('types-editor')).toBeInTheDocument();
  });
});

describe('TopicPageView Overview tab', () => {
  const overviewTab = {
    label: 'Overview',
    href: '/space/space-1/topic-1/overview',
    sidePanelKey: 'blocks',
    dividerBefore: true,
  };

  it('hides it from a reader when the topic has no body', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(mocks.tabs?.systemTabsBefore).not.toContainEqual(overviewTab);
    // With nothing after the rule but authored tabs, the rule goes back to leading them.
    expect(mocks.tabs?.divideBeforeAuthored).toBe(true);
  });

  it('shows it to a reader once the topic has a body', () => {
    mocks.blocks = [{ id: 'block-1' }];
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(mocks.tabs?.systemTabsBefore).toContainEqual(overviewTab);
    // The rule rides Overview instead. Two would claim the row splits in two places.
    expect(mocks.tabs?.divideBeforeAuthored).toBe(false);
    expect(mocks.tabs?.reservedSystemLabels).toEqual(['Explore', 'Comments', 'Overview']);
  });

  it('shows it to an editor with an empty body, since that is the only way to start one', () => {
    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(mocks.tabs?.systemTabsBefore).toContainEqual(overviewTab);
  });

  // Edit *intent* survives the access check to keep the page from flickering on hydration; a
  // control that writes must not. Same line `EntityTabs` draws for the Add tab button.
  it('withholds it from someone with edit intent but no write access and no body', () => {
    mocks.canEdit = false;
    render(<TopicPageView entityId="topic-1" spaceId="space-1" isEditing />);

    expect(mocks.tabs?.systemTabsBefore).not.toContainEqual(overviewTab);
  });

  it('renders the block editor on that route instead of the feed', () => {
    mocks.blocks = [{ id: 'block-1' }];
    mocks.pathname = '/space/space-1/topic-1/overview';
    render(<TopicPageView entityId="topic-1" spaceId="space-1" />);

    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-feed')).toBeNull();
  });
});

describe('resolveTopicTab', () => {
  it('resolves the Comments route', () => {
    expect(resolveTopicTab({ pathname: '/space/a/b/comments', authoredTabId: null, panel: null })).toBe('comments');
  });

  it('resolves legacy system routes to the explore feed', () => {
    expect(resolveTopicTab({ pathname: '/space/a/b/coverage', authoredTabId: null, panel: null })).toBe('explore');
    expect(resolveTopicTab({ pathname: '/space/a/b/subtopics', authoredTabId: null, panel: null })).toBe('explore');
  });

  // A generic entity's blocks live at its bare URL; a topic's bare URL is the explore feed, so the
  // blocks get a segment of their own. Spelled out rather than imported: this is the URL a reader
  // can bookmark, and a test that shares a constant with the page cannot notice it moving.
  it('resolves the blocks route a topic keeps its Overview tab at', () => {
    expect(resolveTopicTab({ pathname: '/space/a/b/overview', authoredTabId: null, panel: null })).toBe('blocks');
  });

  it('still lets an authored tab win over the blocks route', () => {
    expect(resolveTopicTab({ pathname: '/space/a/b/overview', authoredTabId: 'tab-1', panel: null })).toBe('custom');
  });

  it('resolves the side-panel blocks selection independently of the route behind it', () => {
    expect(
      resolveTopicTab({
        pathname: '/space/a/b/comments',
        authoredTabId: null,
        panel: { activeTabId: null, activeSystemTab: 'blocks' },
      })
    ).toBe('blocks');
  });

  it('lets an authored tab take precedence over the route', () => {
    expect(resolveTopicTab({ pathname: '/space/a/b/claims', authoredTabId: 'tab-1', panel: null })).toBe('custom');
  });

  it('uses the side panel selection instead of the page behind it', () => {
    expect(
      resolveTopicTab({
        pathname: '/space/a/b/coverage',
        authoredTabId: 'page-tab',
        panel: { activeTabId: null, activeSystemTab: 'debates' },
      })
    ).toBe('explore');
  });

  it('resolves the side-panel Comments selection independently of the route behind it', () => {
    expect(
      resolveTopicTab({
        pathname: '/space/a/b',
        authoredTabId: null,
        panel: { activeTabId: null, activeSystemTab: 'comments' },
      })
    ).toBe('comments');
  });
});
