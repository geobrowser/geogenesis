'use client';

import * as React from 'react';

import { TopicFollowControl } from '~/core/follows/follow-control';
import { useLiveTopicTemplate } from '~/core/templates/adapters/use-live-topic-template';
import { useEntityTemplatePageOnScreen } from '~/core/templates/primitives/template-shell';
import { TopicTemplate } from '~/core/templates/views/topic-template';

import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveTopicTemplateViewProps {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  compact?: boolean;
  /** Embedded inside a Topic Space shell (suppresses duplicate cover/header). */
  embedded?: boolean;
}

/**
 * Live Geo container connecting `useLiveTopicTemplate` to `TopicTemplate`.
 * Rendered by `EntityPageBody` and `SpaceTopicExploreBody` when `entityTemplatesV2` is enabled.
 */
export function LiveTopicTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
  embedded = false,
}: LiveTopicTemplateViewProps) {
  useEntityTemplatePageOnScreen(!compact && !embedded);
  const { data, isLoading, isSectionsLoading, actionCallbacks } = useLiveTopicTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
    isSpaceHome: embedded,
  });

  if (isLoading) {
    return (
      <div
        className={
          embedded
            ? 'flex w-full flex-col gap-4 pt-1 pb-6'
            : 'mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-6'
        }
      >
        {!embedded && <Skeleton className="h-9 w-2/3 rounded" />}
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
      embedded={embedded}
      isLoadingSections={isSectionsLoading}
      headerActions={
        embedded ? undefined : (
          <EntityPageActions
            entityId={entityId}
            spaceId={spaceId}
            compact={compact}
            variant="template"
            leading={<TopicFollowControl topic={{ id: entityId, name: data.title }} />}
          />
        )
      }
    />
  );
}
