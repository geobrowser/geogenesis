'use client';

import { Schema } from '@effect/schema';
import { useQuery } from '@tanstack/react-query';
import request from 'graphql-request';

import { AllEntitiesQuery } from '~/core/gql/graphql';
import { entitiesQuery } from '~/core/io/v2/fragments';
import { Entity } from '~/core/io/v2/v2.schema';

export default function Page() {
  return <Idk />;
}

function Idk() {
  const result = useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      // This is a placeholder for the actual query function
      // You would typically use a GraphQL client to fetch data here
      const { entities } = await request<AllEntitiesQuery>(
        'https://hypergraph-v2.up.railway.app/graphql',
        entitiesQuery
      );

      console.log('entities', entities);

      return entities.map(e => Schema.decodeUnknownSync(Entity)(e, { errors: 'all' }));
    },
  });

  // too many clients already
  console.log('Idk', result.data, result.error);

  return null;
}
