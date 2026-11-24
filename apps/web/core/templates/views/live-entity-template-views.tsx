'use client';

import * as React from 'react';

import { useLiveEventTemplate } from '~/core/templates/adapters/use-live-event-template';
import { useLiveNewsStoryTemplate } from '~/core/templates/adapters/use-live-news-story-template';
import { useLivePodcastEpisodeTemplate } from '~/core/templates/adapters/use-live-podcast-episode-template';
import { useLivePodcastShowTemplate } from '~/core/templates/adapters/use-live-podcast-show-template';
import { useLivePostTemplate } from '~/core/templates/adapters/use-live-post-template';
import { useLiveSourceTemplate } from '~/core/templates/adapters/use-live-source-template';
import { EventTemplate } from '~/core/templates/views/event-template';
import { NewsStoryTemplate } from '~/core/templates/views/news-story-template';
import { PodcastEpisodeTemplate } from '~/core/templates/views/podcast-episode-template';
import { PodcastShowTemplate } from '~/core/templates/views/podcast-show-template';
import { PostTemplate } from '~/core/templates/views/post-template';
import { SourceTemplate } from '~/core/templates/views/source-template';

import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveEntityTemplateViewProps {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  compact?: boolean;
}

function TemplateLoadingSkeleton({ maxWidth = 840 }: { maxWidth?: number }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-4 px-4 py-6" style={{ maxWidth }}>
      <Skeleton className="h-9 w-3/4 rounded" />
      <Skeleton className="h-[132px] w-full rounded-xl" />
    </div>
  );
}

export function LiveEventTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, actionCallbacks } = useLiveEventTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton />;
  if (!data) return null;

  return (
    <EventTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}

export function LiveNewsStoryTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, isSectionsLoading, actionCallbacks } = useLiveNewsStoryTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton maxWidth={1080} />;
  if (!data) return null;

  return (
    <NewsStoryTemplate
      model={data}
      spaceId={spaceId}
      actionCallbacks={actionCallbacks}
      compact={compact}
      isLoadingSections={isSectionsLoading}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}

export function LiveSourceTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, isSectionsLoading, actionCallbacks } = useLiveSourceTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton />;
  if (!data) return null;

  return (
    <SourceTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      isLoadingSections={isSectionsLoading}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}

export function LivePostTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, actionCallbacks } = useLivePostTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton maxWidth={1020} />;
  if (!data) return null;

  return (
    <PostTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}

export function LivePodcastShowTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, actionCallbacks } = useLivePodcastShowTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton maxWidth={960} />;
  if (!data) return null;

  return (
    <PodcastShowTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}

export function LivePodcastEpisodeTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
}: LiveEntityTemplateViewProps) {
  const { data, isLoading, actionCallbacks } = useLivePodcastEpisodeTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });
  if (isLoading) return <TemplateLoadingSkeleton maxWidth={880} />;
  if (!data) return null;

  return (
    <PodcastEpisodeTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      headerActions={
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable compact={compact} variant="template" />
      }
    />
  );
}
