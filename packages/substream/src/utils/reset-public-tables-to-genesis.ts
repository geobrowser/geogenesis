import { Effect } from 'effect';

import { runSqlFile } from './run-sql-file.js';

export class ResetPublicTablesToGenesisError extends Error {
  _tag: 'ResetPublicTablesToGenesisError' = 'ResetPublicTablesToGenesisError';
}

export function resetPublicTablesToGenesis() {
  return Effect.tryPromise({
    try: () => runSqlFile('./src/sql/clearPublicTables.sql'),
    catch: () => new ResetPublicTablesToGenesisError(`Could not reset public tables to genesis`),
  });
}
