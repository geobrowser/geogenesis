'use client';

import { useQuery } from '@tanstack/react-query';

import { Text } from '~/design-system/text';

import { Backlinks } from '~/partials/entity-page/backlinks';
import { fetchEntityBacklinksPayload } from '~/partials/entity-page/fetch-entity-backlinks';

type BacklinksClientContainerProps = {
  entityId: string;
};

export function BacklinksClientContainer({ entityId }: BacklinksClientContainerProps) {
  const { data } = useQuery({
    queryKey: ['entity-backlinks', entityId],
    queryFn: () => fetchEntityBacklinksPayload(entityId),
  });

  return <Backlinks backlinks={data ?? []} />;
}
