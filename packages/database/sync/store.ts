import { BehaviorSubject, interval, switchMap } from 'rxjs'

type IFact = {
  id: string
  entityId: string
  attribute: string
  value: string | number
}

const localFacts = [
  {
    id: '134245',
    entityId: '130948lk',
    attribute: 'name',
    value: 'Jesus Christ',
  },
]

const getRemoteFacts = async () => {
  return [
    {
      id: Math.random().toString(),
      entityId: Math.random().toString(),
      attribute: 'name',
      value: 'Van Horn',
    },
  ]
}

// Runs "getRemoveFacts" every 10 seconds and pushes the new fact to the remoteFacts$ stream
const remoteFacts$ = interval(1000).pipe(switchMap((_) => getRemoteFacts()))

// Stores all the local facts that are being tracked. These are added by the user.
export const facts$ = new BehaviorSubject<IFact[]>(localFacts)

// Merges the remote facts with the user's local facts.
remoteFacts$.subscribe((value) => {
  facts$.next([...facts$.getValue(), ...value])
})

export const createFact = (fact: IFact) => {
  facts$.next([...facts$.getValue(), fact])
}
