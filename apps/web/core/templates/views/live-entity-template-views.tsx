'use client';

import * as React from 'react';

import { useLiveEventTemplate } from '~/core/templates/adapters/use-live-event-template';
import { useLiveNewsStoryTemplate } from '~/core/templates/adapters/use-live-news-story-template';
import { useLivePostTemplate } from '~/core/templates/adapters/use-live-post-template';
import { useLiveSourceTemplate } from '~/core/templates/adapters/use-live-source-template';
import { EventTemplate } from '~/core/templates/views/event-template';
import { NewsStoryTemplate } from '~/core/templates/views/news-story-template';
import { PostTemplate } from '~/core/templates/views/post-template';
import { SourceTemplate } from '~/core/templates/views/source-template';

import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveEntityTemplateViewProps {
  entityId: string;
  spaceId: string;
  footer?: React.ReactNode;
}

function TemplateLoadingSkeleton({ maxWidth = 840 }: { maxWidth?: number }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-4 px-4 py-6" style={{ maxWidth }}>
      <Skeleton className="h-9 w-3/4 rounded" />
      <Skeleton className="h-[132px] w-full rounded-xl" />
    </div>
  );
}

export function LiveEventTemplateView({ entityId, spaceId, footer }: LiveEntityTemplateViewProps) {
  const { data, isLoading } = useLiveEventTemplate({ entityId, spaceId });
  if (isLoading) return <TemplateLoadingSkeleton />;
  if (!data) return null;

  return (
    <EventTemplate
      model={data}
      headerActions={<EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />}
      footer={footer}
    />
  );
}

export function LiveNewsStoryTemplateView({ entityId, spaceId, footer }: LiveEntityTemplateViewProps) {
  const { data, isLoading } = useLiveNewsStoryTemplate({ entityId, spaceId });
  if (isLoading) return <TemplateLoadingSkeleton />;
  if (!data) return null;

  return (
    <NewsStoryTemplate
      model={data}
      headerActions={<EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />}
      footer={footer}
    />
  );
}

export function LiveSourceTemplateView({ entityId, spaceId, footer }: LiveEntityTemplateViewProps) {
  const { data, isLoading } = useLiveSourceTemplate({ entityId, spaceId });
  if (isLoading) return <TemplateLoadingSkeleton />;
  if (!data) return null;

  return (
    <SourceTemplate
      model={data}
      headerActions={<EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />}
      footer={footer}
    />
  );
}

export function LivePostTemplateView({ entityId, spaceId, footer }: LiveEntityTemplateViewProps) {
  const { data, isLoading } = useLivePostTemplate({ entityId, spaceId });
  if (isLoading) return <TemplateLoadingSkeleton maxWidth={1020} />;
  if (!data) return null;

  return (
    <PostTemplate
      model={data}
      headerActions={<EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />}
      footer={footer}
    />
  );
}
