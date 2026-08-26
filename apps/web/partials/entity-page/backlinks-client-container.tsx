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
    //
    // Only on the initial load, though. A bare `true` also throws when a *background* refetch fails
    // after good rows are already cached, and `TrackedErrorBoundary` has no reset key — so one
    // transient blip would replace real backlinks with the empty fallback and never recover. That is
    // not hypothetical: backlinks refetch on tab focus, so alt-tabbing back through a blip would do
    // it. Throwing only when there is nothing to lose reports the failure that has no other symptom
    // and keeps the data that does.
    throwOnError: (_error, query) => query.state.data === undefined,
  });

  if (isLoading || !data?.length) {
    return null;
  }

  return <Backlinks backlinks={data} />;
}
