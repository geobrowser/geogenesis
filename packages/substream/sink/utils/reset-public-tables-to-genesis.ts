import { Effect } from 'effect';

import { runSqlFile } from './run-sql-file.js';

export class ResetPublicTablesToGenesisError extends Error {
  _tag: 'ResetPublicTablesToGenesisError' = 'ResetPublicTablesToGenesisError';
}

export function resetPublicTablesToGenesis() {
  return Effect.tryPromise({
    try: async () => {
      await runSqlFile('./sink/sql/clear-public-tables.sql');
    },
    catch: error => new ResetPublicTablesToGenesisError(String(error)),
  });
}
