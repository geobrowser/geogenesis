import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Providers } from '~/modules/providers';
import { MockNetworkData } from '~/modules/io';
import SpacePage from '~/pages/space/[id]';

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers>
        <SpacePage
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTypes={[]}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
        />
      </Providers>
    );

    expect(screen.queryByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('New entity')).not.toBeInTheDocument();
  });

  it('Should render empty table', () => {
    render(
      <Providers>
        <SpacePage
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTypes={[]}
          initialColumns={[]}
          initialRows={[]}
          initialSelectedType={null}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).toBeInTheDocument();
  });

  it('Should render non-empty table', () => {
    render(
      <Providers>
        <SpacePage
          spaceId="1"
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
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice')).toBeTruthy();
  });
});
