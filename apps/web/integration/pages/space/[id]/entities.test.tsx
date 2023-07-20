import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Providers } from '~/modules/providers';
import { MockNetworkData } from '~/modules/io';
import { Component } from '~/app/space/[id]/entities/component';

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers>
        <Component
          space={MockNetworkData.makeStubSpace('1')}
          spaceName="Banana"
          spaceImage={null}
          initialTypes={[]}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
            typeId: '',
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('New entity')).not.toBeInTheDocument();
  });

  it('Should render empty table', () => {
    render(
      <Providers>
        <Component
          space={MockNetworkData.makeStubSpace('1')}
          spaceName="Banana"
          spaceImage={null}
          initialTypes={[]}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
            typeId: '',
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).toBeInTheDocument();
  });

  it('Should render non-empty table', () => {
    render(
      <Providers>
        <Component
          space={MockNetworkData.makeStubSpace('1')}
          spaceName="Banana"
          spaceImage={null}
          initialTypes={[]}
          initialColumns={[{ id: '1', triples: [MockNetworkData.makeStubTriple('Alice')] }]}
          initialRows={[
            {
              '1': {
                columnId: '1',
                entityId: '1',
                triples: [],
              },
            },
          ]}
          initialSelectedType={null}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
            typeId: '',
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice')).toBeTruthy();
  });
});
