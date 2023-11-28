import { runSqlFile } from './run-sql-file.js'

export async function resetPublicTablesToGenesis() {
  try {
    await runSqlFile('./src/sql/clearPublicTables.sql')
  } catch (err) {
    console.error('Error resetting database:', err)
  }
}
