import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeStubTriple } from '~/core/io/mocks/mock-network';

import { EntityTableCell } from './entity-table-cell';

describe('EntityTableCell', () => {
  it('renders the id in the name column if the entity has no name triple', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'name',
          entityId: 'banana',
          triples: [],
        }}
        triples={[]}
      />
    );

    expect(screen.getByText('banana')).toBeInTheDocument();
  });

  it('renders the id in the name column if the entity has a name triple, but the value is empty', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'name',
          entityId: 'banana',
          triples: [makeStubTriple('')],
        }}
        triples={[makeStubTriple('')]}
      />
    );

    expect(screen.getByText('banana')).toBeInTheDocument();
  });

  it('renders the name in the name column if the entity has a name triple and the value is not empty', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'name',
          entityId: 'banana',
          triples: [makeStubTriple('apple')],
        }}
        triples={[makeStubTriple('apple')]}
      />
    );

    expect(screen.getByText('apple')).toBeInTheDocument();
  });
});
