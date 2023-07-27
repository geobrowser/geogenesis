import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Providers } from '~/core/providers';
import { MockNetworkData } from '~/core/io';
import { EditableEntityPage } from './editable-entity-page';
import { EntityStoreProvider } from '~/core/state/entity-page-store';

describe('Editable Entity Page', () => {
  it('Renders text schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityStoreProvider
          id="1"
          spaceId="1"
          initialBlockIdsTriple={null}
          initialBlockTriples={[]}
          initialTriples={[]}
          initialSchemaTriples={[
            {
              ...MockNetworkData.makeStubTriple('Schema'),
              attributeName: 'Schema',
              attributeId: 'Schema',
              placeholder: true,
            },
          ]}
        >
          <EditableEntityPage
            id="1"
            name="Banana"
            spaceId="1"
            triples={[]}
            serverAvatarUrl={null}
            serverCoverUrl={null}
            schemaTriples={[
              {
                ...MockNetworkData.makeStubTriple('Schema'),
                attributeName: 'Schema',
                attributeId: 'Schema',
                placeholder: true,
              },
            ]}
          />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'placeholder-text-field' })[0]).toBeInTheDocument();
  });

  it('Renders relation schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityStoreProvider
          id="1"
          spaceId="1"
          initialBlockIdsTriple={null}
          initialBlockTriples={[]}
          initialTriples={[]}
          initialSchemaTriples={[
            {
              ...MockNetworkData.makeStubTriple('Schema'),
              attributeName: 'Schema',
              attributeId: 'Schema',
              value: {
                type: 'entity',
                name: '',
                id: '',
              },
              placeholder: true,
            },
          ]}
        >
          <EditableEntityPage
            id="1"
            name="Banana"
            spaceId="1"
            triples={[]}
            serverAvatarUrl={null}
            serverCoverUrl={null}
            schemaTriples={[
              {
                ...MockNetworkData.makeStubTriple('Schema'),
                attributeName: 'Schema',
                attributeId: 'Schema',
                value: {
                  type: 'entity',
                  name: '',
                  id: '',
                },
                placeholder: true,
              },
            ]}
          />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getAllByTestId('placeholder-entity-autocomplete').length).toBeGreaterThan(0);
  });
});
