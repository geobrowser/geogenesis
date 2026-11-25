'use client';

import * as React from 'react';

import { useLiveClaimTemplate } from '~/core/templates/adapters/use-live-claim-template';
import { useEntityTemplatePageOnScreen } from '~/core/templates/primitives/template-shell';
import { ClaimTemplate } from '~/core/templates/views/claim-template';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';

export interface LiveClaimTemplateViewProps {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  compact?: boolean;
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
}: LiveClaimTemplateViewProps) {
  useEntityTemplatePageOnScreen(!compact);
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
      headerActions={
        <EntityPageActions
          entityId={entityId}
          spaceId={spaceId}
          isVoteable={false}
          compact={compact}
          variant="template"
          graphEntryPoint="claim_page"
        />
      }
    />
  );
}

export interface LiveClaimSectionsViewProps {
  entityId: string;
  spaceId: string;
  /** The claim's text as the page already shows it, so the link back reads right before the claim loads. */
  title: string;
}

/**
 * The Claim page from its Supporting claims down, for the Debate page to scroll into below the debate
 * (GEO-3869). Same adapter and template as the Claim page, so votes, the add-claim "+" and the rows
 * behave and look the same; the debate already shows the claim, so its title and vote box are left out
 * and a small link to the Claim page stands in for them.
 */
export function LiveClaimSectionsView({ entityId, spaceId, title }: LiveClaimSectionsViewProps) {
  const { data, isLoading, isSectionsLoading, actionCallbacks } = useLiveClaimTemplate({ entityId, spaceId });

  if (isLoading) {
    return (
      <div aria-busy="true" className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-5 py-8">
        <Skeleton className="h-5 w-1/2 rounded" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <ClaimTemplate
      model={data}
      actionCallbacks={actionCallbacks}
      isLoadingSections={isSectionsLoading}
      startAtSubClaims
      intro={
        <p className="m-0 text-[15px] leading-[22px] text-grey-04">
          From the claim{' '}
          <Link href={NavUtils.toEntity(spaceId, entityId)} className="font-medium text-text hover:underline">
            {data.title || title}
          </Link>
        </p>
      }
    />
  );
}
