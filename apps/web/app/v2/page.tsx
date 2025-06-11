'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { EntitiesBatchQuery } from '~/core/gql/graphql';
import { EntityDecoder } from '~/core/io/v2/entity';
import { entitiesBatchQuery } from '~/core/io/v2/fragments';
import { graphql } from '~/core/io/v2/graphql';
import { Providers } from '~/core/providers';
import { Entity } from '~/core/v2.types';

export default function Page() {
  return <Idk />;
}

function Idk() {
  const { data } = useQuery({
    queryKey: ['network', 'entities'],
    queryFn: async ({ signal }) => {
      // @TODO: Handle error
      const entities = await Effect.runPromise(
        graphql<EntitiesBatchQuery, Entity[]>({
          query: entitiesBatchQuery,
          decoder: data => data.entities.map(EntityDecoder.decode).filter(e => e !== null),
          variables: { ids: ['1155beff-fad5-49b7-a2e0-da4777b8792c'] },
          signal,
        })
      );

      console.log('entities', entities);
      return entities;
    },
  });

  return <Providers>{JSON.stringify(data, null, 2)}</Providers>;
}
