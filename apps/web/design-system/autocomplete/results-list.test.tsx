import { SYSTEM_IDS } from '@geogenesis/ids';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Providers } from '~/core/providers';
import { Space } from '~/core/types';

import { ResultContent } from './results-list';

const space: Space = {
  id: 'space-1',
  isRootSpace: false,
  editors: [],
  editorControllers: [],
  admins: [],
  spaceConfig: {
    id: 'space-config-1',
    image: null,
    name: 'Space-1',
    triples: [],
    description: 'Description-1',
    types: [
      {
        id: SYSTEM_IDS.SPACE_CONFIGURATION,
        name: 'Space Configuration',
      },
    ],
  },
  createdAtBlock: 'block-1',
};

describe('Entity autocomplete results list', () => {
  it('Renders space, types, and description if available', () => {
    render(
      <Providers>
        <ResultContent
          onClick={() => {
            //
          }}
          spaces={[space]}
          result={{
            id: '1',
            name: 'Name-1',
            description: 'Description-1',
            types: [{ id: 'type-id-1', name: 'Type-1' }],
            triples: [],
          }}
          alreadySelected={false}
        />
      </Providers>
    );

    expect(screen.getByText('Name-1')).toBeInTheDocument();
    expect(screen.getByText('Type-1')).toBeInTheDocument();
    expect(screen.queryByText('Space-1')).toBeInTheDocument();
    expect(screen.queryByText('Description-1')).toBeInTheDocument();
  });
});
