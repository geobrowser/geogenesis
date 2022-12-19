import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { makeStubTriple } from '~/modules/services/mock-network';
import { Providers } from '~/modules/providers';
import TriplesPage from '~/pages/space/[id]';

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers>
        <TriplesPage spaceId="1" spaceName="Banana" spaceImage={null} initialEntityNames={{}} initialTriples={[]} />
      </Providers>
    );

    expect(screen.queryByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('New entity')).not.toBeInTheDocument();
  });

  it('Should render empty table', () => {
    render(
      <Providers>
        <TriplesPage spaceId="1" spaceName="Banana" spaceImage={null} initialEntityNames={{}} initialTriples={[]} />
      </Providers>
    );

    expect(screen.queryByText('No results found')).toBeInTheDocument();
  });

  it('Should render non-empty table', () => {
    render(
      <Providers>
        <TriplesPage
          spaceId="1"
          spaceName="Banana"
          spaceImage={null}
          initialEntityNames={{}}
          initialTriples={[makeStubTriple('Alice')]}
        />
      </Providers>
    );

    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice')).toBeTruthy();
  });

  it('Should toggle predefined queries', async () => {
    userEvent.setup();

    render(
      <Providers>
        <TriplesPage spaceId="1" spaceName="Banana" spaceImage={null} initialEntityNames={{}} initialTriples={[]} />
      </Providers>
    );

    expect(screen.getByText('Preset Banana queries')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /predefined-queries-button/i }));

    expect(screen.queryByText('Preset Banana queries')).not.toBeInTheDocument();
  });

  it('Should toggle advanced filters queries', async () => {
    userEvent.setup();

    render(
      <Providers>
        <TriplesPage spaceId="1" spaceName="Banana" spaceImage={null} initialEntityNames={{}} initialTriples={[]} />
      </Providers>
    );

    expect(screen.getByRole('button', { name: /advanced-filter-button/i })).toBeInTheDocument();
    expect(screen.queryByText('Entity contains')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /advanced-filter-button/i }));
    expect(screen.getByText('Entity contains')).toBeInTheDocument();
  });
});
