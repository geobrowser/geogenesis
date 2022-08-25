import d, { Database } from 'datascript'

class Snapshot {
  #db

  constructor(db: Database) {
    this.#db = db
  }

  datoms() {
    return d.datoms(this.#db, ':eavt')
  }

  query(queryString: string) {
    try {
      return d.q(queryString, this.#db)
    } catch (e) {
      console.warn(e)
      return []
    }
  }

  pull(pullString: string, arg: string) {
    try {
      return d.pull(this.#db, pullString, JSON.parse(arg))
    } catch (e) {
      console.warn(e)
      return null
    }
  }
}

export class DataScriptStore {
  #db: Database
  #dbForSnapshot?: Database
  #snapshot?: Snapshot

  emitter = new EventTarget()

  constructor(schema?: unknown) {
    this.#db = d.empty_db(schema)
  }

  update(...args: unknown[]) {
    const conn = d.conn_from_db(this.#db)
    const report = d.transact(conn, ...args)
    this.#db = report.db_after
    this.emitter.dispatchEvent(new Event('updated'))
  }

  getSnapshot = (): Snapshot => {
    if (this.#db !== this.#dbForSnapshot) {
      this.#snapshot = new Snapshot(this.#db)
      this.#dbForSnapshot = this.#db
    }
    return this.#snapshot!
  }

  subscribe = (f: () => void) => {
    const handler = () => {
      f()
    }

    this.emitter.addEventListener('updated', handler)

    return () => this.emitter.removeEventListener('updated', handler)
  }
}
