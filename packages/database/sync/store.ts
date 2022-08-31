import { BehaviorSubject, interval, switchMap } from 'rxjs'

type IFact = {
  id: string
  entityId: string
  attribute: string
  value: string | number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// TODO:
// Enable editing attributes and values
// Enable tracking changes to attributes and values and triggering updates
export class State {
  mockDatabase: MockDatabase

  // Stores all the local facts that are being tracked. These are added by the user.
  facts$ = new BehaviorSubject<IFact[]>([])

  constructor(mockDatabase: MockDatabase) {
    this.mockDatabase = mockDatabase

    // Merges the remote facts with the user's local facts.
    this.mockDatabase.syncer$.subscribe((value) => {
      // Only pass the union of the local and remote stores
      // state = (local - remote) + remote
      const merged = [...new Set([...this.facts$.getValue(), ...value])]
      this.facts$.next(merged)
    })
  }

  createFact = async (fact: IFact) => {
    // Optimistically add fact to the local store if it doesn't already exist
    const ids = new Set(this.facts$.getValue().map((fact) => fact.id))

    if (!ids.has(fact.id)) {
      this.facts$.next([...this.facts$.getValue(), fact])
      await this._uploadFact(fact)
    }
  }

  private _uploadFact = async (fact: IFact) => {
    // Simulating hitting network
    await sleep(2000)

    return this.mockDatabase.insertFact(fact)
  }
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class MockDatabase {
  REMOTE_FACTS: IFact[] = [
    {
      id: Math.random().toString(),
      entityId: Math.random().toString(),
      attribute: 'name',
      value: 'Van Horn',
    },
  ]

  // Runs "getRemoteFacts" every 5 seconds and pushes the new fact to the facts$ stream
  syncer$ = interval(5000).pipe(switchMap((_) => this.getRemoteFacts()))

  insertFact = (fact: IFact) => {
    const ids = new Set(this.REMOTE_FACTS.map((fact) => fact.id))

    if (ids.has(fact.id)) return this.REMOTE_FACTS
    this.REMOTE_FACTS.push(fact)
    return this.REMOTE_FACTS.concat(fact)
  }

  getRemoteFacts = async () => {
    return this.REMOTE_FACTS
  }
}
