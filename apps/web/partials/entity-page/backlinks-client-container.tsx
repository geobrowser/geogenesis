'use client';

import { useQuery } from '@tanstack/react-query';

import { Backlinks } from '~/partials/entity-page/backlinks';
import { fetchEntityBacklinksPayload } from '~/partials/entity-page/fetch-entity-backlinks';

type BacklinksClientContainerProps = {
  entityId: string;
};

export function BacklinksClientContainer({ entityId }: BacklinksClientContainerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['entity-backlinks', entityId],
    queryFn: () => fetchEntityBacklinksPayload(entityId),
    // `useQuery` swallows errors by default, and the empty state below is indistinguishable from a
    // failed fetch — both render nothing. That silence is why this is explicit: the route variant
    // used to reach here through an async component whose throw was caught and reported by the
    // surrounding `TrackedErrorBoundary`, and without this it would have quietly stopped reporting.
    // The single call site is inside that boundary, so a throw is tracked and falls back to empty.
    throwOnError: true,
  });

  if (isLoading || !data?.length) {
    return null;
  }

  return <Backlinks backlinks={data} />;
}
