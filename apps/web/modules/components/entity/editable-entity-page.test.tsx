import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EntityStoreProvider } from '~/modules/entity';
import { Providers } from '~/modules/providers';
import { makeStubTriple } from '~/modules/services/mock-network';
import { EditableEntityPage } from './editable-entity-page';

describe('Editable Entity Page', () => {
  it('Renders text schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityStoreProvider id={'1'} spaceId={'1'}>
          <EditableEntityPage id="1" space="1" />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'placeholder-text-field' })).toBeInTheDocument();
  });

  it('Renders relation schema triples placeholders', async () => {
    userEvent.setup();

    render(
      <Providers>
        <EntityStoreProvider id={'1'} spaceId={'1'}>
          <EditableEntityPage id="1" space="1" />
        </EntityStoreProvider>
      </Providers>
    );

    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-entity-autocomplete')).toBeInTheDocument();
  });
});
