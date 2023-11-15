import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Providers } from '~/core/providers';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { EditableEntityPage } from './editable-entity-page';

describe('Editable Entity Page', () => {
  it('Renders text schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <EntityStoreProvider id="1" spaceId="1" initialTriples={[]}>
          <EditableEntityPage id="1" spaceId="1" triples={[]} />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'placeholder-text-field' })[0]).toBeInTheDocument();
  });

  it('Renders relation schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <EntityStoreProvider id="1" spaceId="1" initialTriples={[]}>
          <EditableEntityPage id="1" spaceId="1" triples={[]} />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getAllByTestId('placeholder-entity-autocomplete').length).toBeGreaterThan(0);
  });
});
