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
  const { data, isLoading, error } = useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      // This is a placeholder for the actual query function
      // You would typically use a GraphQL client to fetch data here
      const { entities } = await request<AllEntitiesQuery>(
        'https://hypergraph-v2.up.railway.app/graphql',
        entitiesQuery
      );

      return entities.map(e => Schema.decodeUnknownSync(Entity)(e, { errors: 'all' }));
    },
  });

  if (error) {
    return <p>Error: {error.message}</p>;
  }

  if (isLoading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      {data?.map(e => (
        <p key={e.id}>
          {e.name ?? e.id} – {JSON.stringify(e.types, null, 2)}
        </p>
      ))}
    </div>
  );
}
