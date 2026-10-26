import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CuratorSearch, filterToCurators } from './curator-search';

const IBRAHIM = '2e5e36cf94d046f488294e8c0a5cba1e';
const IBRAHIM_SPACE = 'b30570f0d43db28e6582e57eb9d5267c';
const ADAM = '4ec41e008c884cd8b4bd85a1c3d758fe';
const ADAM_SPACE = 'e555b4261afcac533039d6ad57f00173';
// A Person entity no personal space fronts, e.g. a public figure someone wrote about.
const PUBLIC_FIGURE = 'cccc00000000000000000000000000c3';

const mocks = vi.hoisted(() => ({
  query: '',
  results: [] as { id: string; name: string | null }[],
  onQueryChange: vi.fn(),
  spaceByPerson: new Map<string, string>(),
}));

vi.mock('~/core/hooks/use-search', () => ({
  useSearch: () => ({
    query: mocks.query,
    onQueryChange: mocks.onQueryChange,
    results: mocks.results,
    isLoading: false,
  }),
}));
vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async (ids: string[]) =>
    new Map(ids.flatMap(id => (mocks.spaceByPerson.has(id) ? [[id, mocks.spaceByPerson.get(id)!]] : []))),
}));

function renderSearch(props: Partial<React.ComponentProps<typeof CuratorSearch>> = {}) {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CuratorSearch
        placeholder="Allocate a curator by name…"
        allocatedIds={new Set()}
        onSelect={onSelect}
        {...props}
      />
    </QueryClientProvider>
  );
  return onSelect;
}

beforeEach(() => {
  mocks.query = 'a';
  mocks.results = [
    { id: IBRAHIM, name: 'Ibrahim Hassan' },
    { id: PUBLIC_FIGURE, name: 'Famous Person' },
    { id: ADAM, name: 'Adam Al-Roum' },
  ];
  mocks.spaceByPerson = new Map([
    [IBRAHIM, IBRAHIM_SPACE],
    [ADAM, ADAM_SPACE],
  ]);
  mocks.onQueryChange.mockClear();
});
afterEach(cleanup);

describe('filterToCurators', () => {
  it('keeps only people who front a personal space, carrying that space', () => {
    expect(filterToCurators(mocks.results, mocks.spaceByPerson)).toEqual([
      { spaceId: IBRAHIM_SPACE, personId: IBRAHIM, name: 'Ibrahim Hassan' },
      { spaceId: ADAM_SPACE, personId: ADAM, name: 'Adam Al-Roum' },
    ]);
  });

  it('lists a space once even when two person results point at it', () => {
    const twice = filterToCurators(
      [
        { id: IBRAHIM, name: 'Ibrahim Hassan' },
        { id: 'ffff00000000000000000000000000f6', name: 'Ibrahim (old)' },
      ],
      new Map([
        [IBRAHIM, IBRAHIM_SPACE],
        ['ffff00000000000000000000000000f6', IBRAHIM_SPACE],
      ])
    );
    expect(twice).toHaveLength(1);
  });
});

describe('CuratorSearch', () => {
  it('never offers a person without a personal space', async () => {
    renderSearch();
    expect(await screen.findByRole('option', { name: 'Ibrahim Hassan' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Adam Al-Roum' })).toBeInTheDocument();
    expect(screen.queryByText('Famous Person')).not.toBeInTheDocument();
  });

  it('selects the personal space and clears the box', async () => {
    const onSelect = renderSearch();
    fireEvent.click(await screen.findByRole('option', { name: 'Adam Al-Roum' }));
    expect(onSelect).toHaveBeenCalledWith({ spaceId: ADAM_SPACE, personId: ADAM, name: 'Adam Al-Roum' });
    expect(mocks.onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows already-allocated curators as Allocated, by space or by curator-app person id', async () => {
    const onSelect = renderSearch({ allocatedIds: new Set([IBRAHIM_SPACE, ADAM]) });
    const ibrahim = await screen.findByRole('option', { name: /Ibrahim Hassan/ });
    expect(ibrahim).toBeDisabled();
    expect(ibrahim).toHaveTextContent('Allocated');
    expect(screen.getByRole('option', { name: /Adam Al-Roum/ })).toBeDisabled();
    fireEvent.click(ibrahim);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says so when only people without a personal space match', async () => {
    mocks.query = 'famous';
    mocks.results = [{ id: PUBLIC_FIGURE, name: 'Famous Person' }];
    renderSearch();
    expect(await screen.findByText('No one with a personal space matches “famous”.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('shows nothing until something is typed', () => {
    mocks.query = '';
    renderSearch();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument();
  });
});
