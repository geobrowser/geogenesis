import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeStubTriple } from '~/core/io/mocks/mock-network';
import { makeStubTripleWithAttributeAndValue } from '~/core/io/mocks/mock-network';

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

  it('renders a string cell if the triple value type is string', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'string column type',
          entityId: 'banana',
          triples: [
            makeStubTripleWithAttributeAndValue(
              'entity name',
              'banana',
              {
                id: 'some attribute id',
                name: 'some attribute name',
              },
              {
                type: 'TEXT',
                value: 'apple',
              }
            ),
          ],
        }}
        triples={[
          makeStubTripleWithAttributeAndValue(
            'entity name',
            'banana',
            {
              id: 'some attribute id',
              name: 'some attribute name',
            },
            {
              type: 'TEXT',
              value: 'some string value',
            }
          ),
        ]}
      />
    );

    expect(screen.getByText('some string value')).toBeInTheDocument();
  });

  it('renders a web url cell if the triple value type is web url', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'string column type',
          entityId: 'banana',
          triples: [
            makeStubTripleWithAttributeAndValue(
              'entity name',
              'banana',
              {
                id: 'some attribute id',
                name: 'some attribute name',
              },
              {
                type: 'URL',
                value: 'some url value',
              }
            ),
          ],
        }}
        triples={[
          makeStubTripleWithAttributeAndValue(
            'entity name',
            'banana',
            {
              id: 'some attribute id',
              name: 'some attribute name',
            },
            {
              type: 'URL',
              value: 'some url value',
            }
          ),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'some url value' })).toBeInTheDocument();
  });

  it('renders an entity cell if the triple value type is entity', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'string column type',
          entityId: 'banana',
          triples: [
            makeStubTripleWithAttributeAndValue(
              'entity name',
              'banana',
              {
                id: 'some attribute id',
                name: 'some attribute name',
              },
              {
                type: 'URL',
                value: 'some url value',
              }
            ),
          ],
        }}
        triples={[
          makeStubTripleWithAttributeAndValue(
            'entity name',
            'banana',
            {
              id: 'some attribute id',
              name: 'some attribute name',
            },
            {
              value: 'some entity id',
              type: 'ENTITY',
              name: 'some entity name',
            }
          ),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'some entity name' })).toBeInTheDocument();
  });

  it('renders an image cell if the triple value type is image', () => {
    render(
      <EntityTableCell
        isExpanded={false}
        space="sandwich"
        cell={{
          columnId: 'string column type',
          entityId: 'banana',
          triples: [
            makeStubTripleWithAttributeAndValue(
              'entity name',
              'banana',
              {
                id: 'some attribute id',
                name: 'some attribute name',
              },
              {
                type: 'IMAGE',
                value: 'some image value',
              }
            ),
          ],
        }}
        triples={[
          makeStubTripleWithAttributeAndValue(
            'entity name',
            'banana',
            {
              id: 'some attribute id',
              name: 'some attribute name',
            },
            {
              type: 'IMAGE',
              value: 'some image value',
            }
          ),
        ]}
      />
    );

    expect(screen.getByRole('img').getAttribute('src')).toBe('some image value');
  });
});
