declare module 'datascript' {
  export class Database {}
  export class Connection {}

  type Datom = {
    e: number
    a: string
    v: any
    tx: number
  }

  export function datoms(database: Database, index: string): Datom[]
  export function q(query: string, database: Database): unknown
  export function pull(database: Database, pull: string, index: string): unknown
  export function empty_db(schema?: unknown): Database
  export function conn_from_db(database: Database): Connection
  export function transact(connection: Connection, ...parameters: unknown[])
}
