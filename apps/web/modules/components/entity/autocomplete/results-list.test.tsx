import { render, screen } from '@testing-library/react';
import { describe } from 'vitest';
import { Providers } from '~/modules/providers';
import { Entity } from '~/modules/types';
import { ResultContent } from './results-list';

const duplicateEntities: Entity[] = [
  {
    id: '1',
    name: 'Name-1',
    description: 'Description-1',
    types: ['Type-1'],
  },
  {
    id: '2',
    name: 'Name-1',
    description: 'Description-2',
    types: ['Type-1'],
  },
];

describe('Entity autocomplete results list', () => {
  // See <ResultDisambiguation /> comments for more context on disambiguation prioritization
  it('Prioritizes types if both types and description exist', () => {
    render(
      <Providers>
        <ResultContent
          onClick={() => {
            //
          }}
          result={{
            id: '1',
            name: 'Name-1',
            description: 'Description-1',
            types: ['Type-1'],
          }}
          results={[
            {
              id: '1',
              name: 'Name-1',
              description: 'Description-1',
              types: ['Type-1'],
            },
          ]}
          alreadySelected={false}
        />
      </Providers>
    );

    expect(screen.getByText('Type-1')).toBeInTheDocument();
    expect(screen.queryByText('Description-1')).not.toBeInTheDocument();
  });

  it('Prioritizes description if only description exists', () => {
    render(
      <Providers>
        <ResultContent
          onClick={() => {
            //
          }}
          result={{
            id: '2',
            name: 'Name-2',
            description: 'Description-2',
            types: [],
          }}
          results={[
            {
              id: '2',
              name: 'Name-2',
              description: 'Description-2',
              types: [],
            },
          ]}
          alreadySelected={false}
        />
      </Providers>
    );

    expect(screen.queryByText('Type-1')).not.toBeInTheDocument();
    expect(screen.getByText('Description-2')).toBeInTheDocument();
  });

  it('Prioritizes description if entities with the same name and types exist', () => {
    render(
      <Providers>
        <ResultContent
          onClick={() => {
            //
          }}
          result={duplicateEntities[0]}
          results={duplicateEntities}
          alreadySelected={false}
        />
      </Providers>
    );

    expect(screen.getByText('Description-1')).toBeInTheDocument();
    expect(screen.queryByText('Type-1')).not.toBeInTheDocument();
  });
});
