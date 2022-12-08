import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '~/modules/services/providers';
import TriplesPage from '~/pages/space/[id]';

vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      replace: () => {
        //
      },
    };
  },
}));

describe('Space page', () => {
  it('Should render header as non-editor', () => {
    render(
      <Providers>
        <TriplesPage spaceId="1" spaceName="Banana" spaceImage={null} initialEntityNames={{}} initialTriples={[]} />
      </Providers>
    );

    expect(screen.findByText('Banana')).toBeTruthy();
    expect(screen.queryByText('New entity')).not.toBeInTheDocument();
  });
});
