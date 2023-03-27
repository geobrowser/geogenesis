import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Providers } from '~/modules/providers';
import { makeStubTriple } from '~/modules/services/mock-network';
import { Triple } from '~/modules/types';
import EntityPage from '~/pages/space/[id]/[entityId]';

const scalarDescriptionTriple: Triple = {
  id: '1',
  entityId: '1',
  space: '1',
  attributeId: 'Description',
  attributeName: 'Description',
  entityName: 'Banana',
  value: {
    id: '1',
    type: 'string',
    value: 'Description of a Banana',
  },
};

const genericAttribute: Triple = {
  id: '1',
  entityId: '1',
  space: '1',
  attributeId: 'attribute-1',
  attributeName: 'Attribute 1',
  entityName: 'Banana',
  value: {
    id: '1',
    type: 'string',
    value: 'The first attribute',
  },
};

describe('Entity page', () => {
  it('Renders page name', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[]}
          schemaTriples={[]}
          referencedByEntities={[]}
        />
      </Providers>
    );

    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('Renders entity description from description that is a string type', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[scalarDescriptionTriple]}
          schemaTriples={[]}
          referencedByEntities={[]}
        />
      </Providers>
    );

    expect(screen.queryAllByText('Description of a Banana').length).toEqual(2);
  });

  it('Renders entity triples', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[genericAttribute]}
          schemaTriples={[]}
          referencedByEntities={[]}
        />
      </Providers>
    );

    expect(screen.getByText('Attribute 1')).toBeInTheDocument();
  });

  it('Renders entity triples without names', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[{ ...genericAttribute, attributeName: null }]}
          schemaTriples={[]}
          referencedByEntities={[]}
        />
      </Providers>
    );

    expect(screen.getByText('attribute-1')).toBeInTheDocument();
  });

  it('Renders empty linked entities', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[]}
          schemaTriples={[]}
          referencedByEntities={[]}
        />
      </Providers>
    );

    expect(screen.getByText('There are no entities referencing Banana.')).toBeInTheDocument();
  });

  it('Renders linked entity', () => {
    render(
      <Providers>
        <EntityPage
          id="1"
          name="Banana"
          space="1"
          versions={[]}
          triples={[]}
          schemaTriples={[]}
          referencedByEntities={[
            {
              id: '1',
              name: 'Apple',
              types: [
                {
                  id: '1',
                  name: 'Fruit Type',
                },
                {
                  id: '2',
                  name: 'Other Type',
                },
              ],
              space: {
                id: '3',
                name: 'Fruit',
                image: null,
              },
            },
          ]}
        />
      </Providers>
    );

    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Fruit Type')).toBeInTheDocument();
    expect(screen.getByText('Other Type')).toBeInTheDocument();
  });
});
