import { BehaviorSubject, interval, Observable, switchMap } from 'rxjs'

type IFact = {
  id: string
  entityId: string
  attribute: string
  value: string | number
}

interface IMockApi {
  /**
   * Runs "getRemoteFacts" every 5 seconds and pushes the new fact to subscribers.
   *
   * This should fetch _all_ data the app needs at once. Each subscriber charge of
   * massaging the data pushed to it.
   *
   * We _might_ want multiple syncers for the different data that we have in the app.
   * We also want to make sure we're only fetching once instead of once for each
   * subscriber. We can also do some optimizations here by checking if the data has
   * changed or not
   */
  syncer$: Observable<IFact[]>
  insertFact: (fact: IFact) => IFact[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// TODO:
// Enable editing attributes and values
// Enable tracking changes to attributes and values and triggering updates
//
// This could be literally any type of store. Doesn't have to be rxjs-based. Could be mobx or anything.
// Just depends on how we want to do the React bindings
export class Facts {
  mockApi: IMockApi

  // Stores all the local facts that are being tracked. These are added by the user.
  facts$ = new BehaviorSubject<IFact[]>([])

  constructor(mockApi: IMockApi) {
    this.mockApi = mockApi

    // Merges the remote facts with the user's local facts.
    this.mockApi.syncer$.subscribe((value) => {
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

  get facts() {
    return this.facts$.getValue()
  }

  private _uploadFact = async (fact: IFact) => {
    // Simulating hitting network
    await sleep(2000)

    return this.mockApi.insertFact(fact)
  }
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class MockApi implements IMockApi {
  private REMOTE_FACTS: IFact[] = [
    {
      id: Math.random().toString(),
      entityId: Math.random().toString(),
      attribute: 'name',
      value: 'Van Horn',
    },
  ]

  /**
   * Runs "getRemoteFacts" every 5 seconds and pushes the new fact to subscribers.
   *
   * This should fetch _all_ data the app needs at once. Each subscriber charge of
   * massaging the data pushed to it.
   *
   * We _might_ want multiple syncers for the different data that we have in the app.
   * We also want to make sure we're only fetching once instead of once for each
   * subscriber. We can also do some optimizations here by checking if the data has
   * changed or not
   */
  syncer$ = interval(5000).pipe(switchMap((_) => this.getRemoteFacts()))

  insertFact = (fact: IFact) => {
    const ids = new Set(this.REMOTE_FACTS.map((fact) => fact.id))

    if (ids.has(fact.id)) return this.REMOTE_FACTS
    this.REMOTE_FACTS.push(fact)
    return this.REMOTE_FACTS.concat(fact)
  }

  private getRemoteFacts = async () => {
    return this.REMOTE_FACTS
  }
}
