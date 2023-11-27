import { bootstrapRoot } from '../bootstrap-root.js'
import { runSqlFile } from './run-sql-file.js'

export const resetPublicTablesToGenesis = async () => {
  try {
    await runSqlFile('./src/sql/clearPublicTables.sql')
    await bootstrapRoot()
  } catch (err) {
    console.error('Error resetting database:', err)
  }
}
