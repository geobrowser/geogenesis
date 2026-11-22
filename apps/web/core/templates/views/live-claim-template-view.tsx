'use client';

import * as React from 'react';

import { useLiveClaimTemplate } from '~/core/templates/adapters/use-live-claim-template';
import { ClaimTemplate } from '~/core/templates/views/claim-template';

import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveClaimTemplateViewProps {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  compact?: boolean;
  footer?: React.ReactNode;
}

/**
 * Live Geo container connecting `useLiveClaimTemplate` to `ClaimTemplate`.
 * Rendered by `EntityPageBody` when the `entityTemplatesV2` feature flag is enabled.
 */
export function LiveClaimTemplateView({
  entityId,
  spaceId,
  serverCoverUrl,
  compact = false,
  footer,
}: LiveClaimTemplateViewProps) {
  const { data, isLoading, isSectionsLoading, actionCallbacks } = useLiveClaimTemplate({
    entityId,
    spaceId,
    serverCoverUrl,
  });

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 py-6">
        <Skeleton className="h-9 w-3/4 rounded" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <ClaimTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      compact={compact}
      isLoadingSections={isSectionsLoading}
      headerActions={<EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable={false} compact={compact} />}
      footer={footer}
    />
  );
}
