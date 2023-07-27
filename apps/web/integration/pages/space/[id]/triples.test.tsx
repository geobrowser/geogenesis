import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MockNetworkData } from '~/core/io';
import { Providers } from '~/core/providers';

import { Component } from '~/app/space/[id]/triples/component';

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers>
        <Component
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTriples={[]}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
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
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTriples={[]}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
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
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTriples={[MockNetworkData.makeStubTriple('Alice')]}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
          }}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice')).toBeTruthy();
  });

  it('Should toggle advanced filters queries', async () => {
    userEvent.setup();

    render(
      <Providers>
        <Component
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialTriples={[]}
          initialParams={{
            filterState: [],
            pageNumber: 0,
            query: '',
          }}
        />
      </Providers>
    );

    expect(screen.getByRole('button', { name: /advanced-filter-button/i })).toBeInTheDocument();
    expect(screen.queryByText('Entity contains')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /advanced-filter-button/i }));
    expect(screen.getByText('Entity contains')).toBeInTheDocument();
  });
});
