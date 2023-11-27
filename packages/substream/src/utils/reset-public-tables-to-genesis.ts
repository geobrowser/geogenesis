import { runSqlFile } from './run-sql-file.js'

export const resetPublicTablesToGenesis = async () => {
  try {
    await runSqlFile('./src/sql/clearPublicTables.sql')
  } catch (err) {
    console.error('Error resetting database:', err)
  }
}
