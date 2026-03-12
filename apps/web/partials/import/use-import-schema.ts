'use client';

import { useQuery } from '@tanstack/react-query';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { Property } from '~/core/types';

export function useImportSchema(params: {
  selectedTypeId?: string | null;
  spaceId: string;
}): { schema: Property[] } {
  const { selectedTypeId, spaceId } = params;

  const { data: schema = [] } = useQuery({
    queryKey: ['import-schema', selectedTypeId, spaceId],
    queryFn: () => getSchemaFromTypeIds([{ id: selectedTypeId!, spaceId }]),
    enabled: Boolean(selectedTypeId && spaceId),
  });

  return { schema };
}
