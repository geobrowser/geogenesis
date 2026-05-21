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
  });

  if (isLoading || !data?.length) {
    return null;
  }

  return <Backlinks backlinks={data} />;
}
