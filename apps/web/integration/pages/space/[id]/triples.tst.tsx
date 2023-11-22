import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Providers } from '~/core/providers';

import { Component } from '~/app/space/(entities)/[id]/entities/component';

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <Component
          spaceName="Banana"
          spaceImage={null}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
          initialTypes={[]}
          initialParams={{
            typeId: '',
            filterState: [],
            pageNumber: 0,
            query: '',
          }}
          space={{
            admins: [],
            id: '1',
            attributes: {},
            createdAtBlock: '0',
            editorControllers: [],
            entityId: '',
            editors: [],
            isRootSpace: false,
            spaceConfigEntityId: null,
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('New entity')).not.toBeInTheDocument();
  });

  it('Should render empty table', () => {
    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <Component
          spaceName="Banana"
          spaceImage={null}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
          initialTypes={[]}
          initialParams={{
            typeId: '',
            filterState: [],
            pageNumber: 0,
            query: '',
          }}
          space={{
            admins: [],
            id: '1',
            attributes: {},
            createdAtBlock: '0',
            editorControllers: [],
            entityId: '',
            editors: [],
            isRootSpace: false,
            spaceConfigEntityId: null,
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).toBeInTheDocument();
  });
});
