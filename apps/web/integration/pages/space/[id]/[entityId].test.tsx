import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeStubTriple } from '~/modules/services/mock-network';
import { Providers } from '~/modules/services/providers';
import { Triple } from '~/modules/types';
import EntityPage from '~/pages/space/[id]/[entityId]';

const scalarDescriptionTriple: Triple = {
  id: '1',
  entityId: '1',
  space: '1',
  attributeId: 'Description',
  entityName: 'Banana',
  value: {
    id: '1',
    type: 'string',
    value: 'Description of a Banana',
  },
};

const linkedDescriptionTriple: Triple = {
  id: '1',
  entityId: '1',
  space: '1',
  attributeId: 'Description',
  entityName: 'Banana',
  value: {
    id: '1',
    type: 'entity',
  },
};

const genericAttribute: Triple = {
  id: '1',
  entityId: '1',
  space: '1',
  attributeId: 'attribute-1',
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
        <EntityPage entityNames={{}} id="1" name="Banana" space="1" triples={[]} linkedEntities={{}} />
      </Providers>
    );

    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('Renders entity description from linked description', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{ '1': 'Banana' }}
          id="1"
          name="Description of a Banana"
          space="1"
          triples={[linkedDescriptionTriple]}
          linkedEntities={{}}
        />
      </Providers>
    );

    expect(screen.getByText('Description of a Banana')).toBeInTheDocument();
  });

  it('Renders entity description from scalar description', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{}}
          id="1"
          name="Banana"
          space="1"
          triples={[scalarDescriptionTriple]}
          linkedEntities={{}}
        />
      </Providers>
    );

    expect(screen.getByText('Description of a Banana')).toBeInTheDocument();
  });

  it('Renders entity triples', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{
            'attribute-1': 'Attribute 1',
          }}
          id="1"
          name="Banana"
          space="1"
          triples={[genericAttribute]}
          linkedEntities={{}}
        />
      </Providers>
    );

    expect(screen.getByText('Attribute 1')).toBeInTheDocument();
  });

  it('Renders entity triples without names', () => {
    render(
      <Providers>
        <EntityPage entityNames={{}} id="1" name="Banana" space="1" triples={[genericAttribute]} linkedEntities={{}} />
      </Providers>
    );

    expect(screen.getByText('attribute-1')).toBeInTheDocument();
  });

  it('Renders empty linked entities', () => {
    render(
      <Providers>
        <EntityPage entityNames={{}} id="1" name="Banana" space="1" triples={[]} linkedEntities={{}} />
      </Providers>
    );

    expect(screen.getByText('There are no other entities that are linking to this entity.')).toBeInTheDocument();
  });

  it('Renders linked entity', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{}}
          id="1"
          name="Banana"
          space="1"
          triples={[]}
          linkedEntities={{
            '1': {
              triples: [scalarDescriptionTriple],
              name: 'Apple',
              id: '1',
            },
          }}
        />
      </Providers>
    );

    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('Renders linked entity description if it exists', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{
            Description: 'Description of a Banana',
          }}
          id="1"
          name="Banana"
          space="1"
          triples={[]}
          linkedEntities={{
            '2': {
              triples: [linkedDescriptionTriple],
              name: 'Apple',
              id: '2',
            },
          }}
        />
      </Providers>
    );

    expect(screen.getByText('Description of a Banana')).toBeInTheDocument();
  });

  it('Does not render linked entity description if empty', () => {
    render(
      <Providers>
        <EntityPage
          entityNames={{}}
          id="1"
          name="Banana"
          space="1"
          triples={[]}
          linkedEntities={{
            '1': {
              triples: [],
              name: 'Apple',
              id: '1',
            },
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('Description of a Banana')).not.toBeInTheDocument();
  });

  it('Renders correct linked entity triple counts', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityPage
          entityNames={{}}
          id="1"
          name="Banana"
          space="1"
          triples={[]}
          linkedEntities={{
            '1': {
              triples: [makeStubTriple('Alice'), makeStubTriple('Bob')],
              name: 'Apple',
              id: '1',
            },
          }}
        />
      </Providers>
    );

    expect(screen.getByText('2 values')).toBeInTheDocument();
    expect(screen.getByText('Show 2 more values')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Show 2 more values'));
    expect(screen.queryByText('Show 2 more values')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide 2 more values')).toBeInTheDocument();
  });

  it('Renders correct linked entity triple counts when one is linked to the main entity', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityPage
          entityNames={{}}
          id="1"
          name="Banana"
          space="1"
          triples={[]}
          linkedEntities={{
            '2': {
              triples: [
                {
                  ...makeStubTriple('Alice'),
                  value: {
                    type: 'entity',
                    id: '1',
                  },
                },
                makeStubTriple('Bob'),
              ],
              name: 'Apple',
              id: '2',
            },
          }}
        />
      </Providers>
    );

    expect(screen.getByText('2 values')).toBeInTheDocument();
    expect(screen.getByText('Show 1 more value')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Show 1 more value'));
    expect(screen.queryByText('Show 1 more value')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide 1 more value')).toBeInTheDocument();
  });
});
