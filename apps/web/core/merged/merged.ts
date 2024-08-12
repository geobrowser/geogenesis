import { QueryClient } from '@tanstack/react-query';

import { Subgraph } from '~/core/io';
import { Column, OmitStrict, Row, Value } from '~/core/types';
import { EntityTable } from '~/core/utils/entity-table';

import { fetchColumns } from '../io/fetch-columns';
import { fetchRows } from '../io/fetch-rows';

interface MergedDataSourceOptions {
  subgraph: Subgraph.ISubgraph;
  cache: QueryClient;
}

interface IMergedDataSource
  extends OmitStrict<
    Subgraph.ISubgraph,
    // These data models don't have local equivalents, so we don't need merging logic for them.
    | 'fetchProposal'
    | 'fetchEntity'
    | 'fetchProposals'
    | 'fetchTableRowEntities'
    | 'fetchEntities'
    | 'fetchSpace'
    | 'fetchSpaces'
    | 'fetchProfile'
    // Merging logic may be added in the future
    | 'fetchResults'
  > {
  // Rows and columns aren't part of the subgraph API and instead are higher-order functions that
  // call the subgraph APIs themselves. This is because rows and columns are not entities in the
  // subgraph. We include them here so have a unified API for merging data in the app.
  rows: (
    options: Parameters<typeof fetchRows>[0],
    columns: Column[],
    selectedTypeEntityId?: string
  ) => Promise<{ rows: Row[] }>;
  columns: (options: Parameters<typeof fetchColumns>[0]) => Promise<Column[]>;
}

/**
 * The Merged module attempts to merge local actions with network data. The API surface area for methods
 * on the Merged class should be the same as the Network class.
 */
export class Merged implements IMergedDataSource {
  private cache: QueryClient;
  private subgraph: Subgraph.ISubgraph;

  constructor({ subgraph, cache }: MergedDataSourceOptions) {
    this.subgraph = subgraph;
    this.cache = cache;
  }

  columns = async (options: Parameters<typeof fetchColumns>[0]) => {
    const serverColumns = await fetchColumns(options);

    return EntityTable.columnsFromLocalChanges(this.store.allActions, serverColumns, options.params.typeIds?.[0]);
  };
}
