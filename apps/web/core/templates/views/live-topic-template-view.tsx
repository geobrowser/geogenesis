'use client';

import * as React from 'react';

import { TopicFollowControl } from '~/core/follows/follow-control';
import { useLiveTopicTemplate } from '~/core/templates/adapters/use-live-topic-template';
import { TopicTemplate } from '~/core/templates/views/topic-template';

import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveTopicTemplateViewProps {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  compact?: boolean;
  footer?: React.ReactNode;
}

/**
 * Live Geo container connecting `useLiveTopicTemplate` to `TopicTemplate`.
 * Rendered by `EntityPageBody` when the `entityTemplatesV2` feature flag is enabled.
 */
export function LiveTopicTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
  footer,
}: LiveTopicTemplateViewProps) {
  const { data, isLoading, actionCallbacks } = useLiveTopicTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-6">
        <Skeleton className="h-9 w-2/3 rounded" />
        <Skeleton className="h-[120px] w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <TopicTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      headerActions={
        <EntityPageActions
          entityId={entityId}
          spaceId={spaceId}
          compact={compact}
          leading={<TopicFollowControl topic={{ id: entityId, name: data.title }} />}
        />
      }
      footer={footer}
    />
  );
}
