import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveClaimTemplateView } from './live-claim-template-view';
import {
  LiveEventTemplateView,
  LiveNewsStoryTemplateView,
  LivePodcastEpisodeTemplateView,
  LivePodcastShowTemplateView,
  LivePostTemplateView,
  LiveSourceTemplateView,
} from './live-entity-template-views';
import { LiveTopicTemplateView } from './live-topic-template-view';

const mocks = vi.hoisted(() => ({
  pageActions: null as Record<string, unknown> | null,
  /** The templates themselves render the header actions they are handed, and nothing else. */
  Shell: ({ headerActions }: { headerActions?: unknown }) => headerActions,
}));

// Each adapter reaches for the sync engine. This file asserts only which entry point each live view
// hands its header's graph link, so every adapter returns a loaded, empty model.
vi.mock('~/core/templates/adapters/use-live-claim-template', () => ({ useLiveClaimTemplate: () => loaded() }));
vi.mock('~/core/templates/adapters/use-live-event-template', () => ({ useLiveEventTemplate: () => loaded() }));
vi.mock('~/core/templates/adapters/use-live-news-story-template', () => ({
  useLiveNewsStoryTemplate: () => loaded(),
}));
vi.mock('~/core/templates/adapters/use-live-podcast-episode-template', () => ({
  useLivePodcastEpisodeTemplate: () => loaded(),
}));
vi.mock('~/core/templates/adapters/use-live-podcast-show-template', () => ({
  useLivePodcastShowTemplate: () => loaded(),
}));
vi.mock('~/core/templates/adapters/use-live-post-template', () => ({ useLivePostTemplate: () => loaded() }));
vi.mock('~/core/templates/adapters/use-live-source-template', () => ({ useLiveSourceTemplate: () => loaded() }));
vi.mock('~/core/templates/adapters/use-live-topic-template', () => ({ useLiveTopicTemplate: () => loaded() }));
vi.mock('~/core/templates/primitives/template-shell', () => ({ useEntityTemplatePageOnScreen: () => {} }));
vi.mock('~/core/follows/follow-control', () => ({ TopicFollowControl: () => null }));

vi.mock('~/core/templates/views/claim-template', () => ({ ClaimTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/event-template', () => ({ EventTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/news-story-template', () => ({ NewsStoryTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/podcast-episode-template', () => ({ PodcastEpisodeTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/podcast-show-template', () => ({ PodcastShowTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/post-template', () => ({ PostTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/source-template', () => ({ SourceTemplate: mocks.Shell }));
vi.mock('~/core/templates/views/topic-template', () => ({ TopicTemplate: mocks.Shell }));

vi.mock('~/partials/entity-page/entity-page-actions', () => ({
  EntityPageActions: (props: Record<string, unknown>) => {
    mocks.pageActions = props;
    return null;
  },
}));

// Hoisted with the mocks that call it; a function declaration is initialized before any import runs.
function loaded() {
  return { data: { title: 'Entity' }, isLoading: false, isSectionsLoading: false, actionCallbacks: {} };
}

beforeEach(() => {
  mocks.pageActions = null;
});

afterEach(cleanup);

type LiveView = React.ComponentType<{ entityId: string; spaceId: string }>;

// GEO-3866: every template page used to record its "Explore graph" clicks as `topic_page`.
describe('the graph entry point each template page records', () => {
  it.each<[string, string, LiveView]>([
    ['topic', 'topic_page', LiveTopicTemplateView],
    ['claim', 'claim_page', LiveClaimTemplateView],
    ['event', 'event_page', LiveEventTemplateView],
    ['news story', 'news_story_page', LiveNewsStoryTemplateView],
    ['source', 'source_page', LiveSourceTemplateView],
    ['post', 'post_page', LivePostTemplateView],
    ['podcast show', 'podcast_show_page', LivePodcastShowTemplateView],
    ['podcast episode', 'podcast_episode_page', LivePodcastEpisodeTemplateView],
  ])('a %s page records %s', (_kind, entryPoint, View) => {
    render(<View entityId="entity-1" spaceId="space-1" />);

    expect(mocks.pageActions).toMatchObject({ variant: 'template', graphEntryPoint: entryPoint });
  });
});
