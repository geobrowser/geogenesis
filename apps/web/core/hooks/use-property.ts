import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { propertyQuery } from '~/core/io/v2/fragments';
import { graphql } from '~/core/io/v2/graphql';

interface UsePropertyOptions {
  id: string;
  enabled?: boolean;
}

interface PropertyData {
  id: string;
  dataType: string;
  dataTypeId?: string | null;
  renderableType?: string | null;
}

export function useProperty({ id, enabled = true }: UsePropertyOptions) {
  console.log('useProperty', { id, enabled });
  return useQuery({
    queryKey: ['property', id],
    enabled: enabled && !!id,
    queryFn: async ({ signal }) => {
      const result = await Effect.runPromise(
        graphql<any, PropertyData | null>({
          query: propertyQuery,
          decoder: data => {
            const property = data.property;
            if (property && property.dataType) {
              return {
                id: property.id,
                dataType: property.dataType,
                dataTypeId: property.dataTypeId || null,
                renderableType: property.renderableType || null,
              };
            }
            return null;
          },
          variables: { id },
          signal,
        })
      );
      return result;
    },
  });
}