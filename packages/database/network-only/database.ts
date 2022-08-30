export type ResolvedFact = {
  id: string
  entityId: string
  attribute: string
  value: string | number
}

export const MOCK_FACTS: ResolvedFact[] = [
  {
    id: '21340987',
    entityId: '1234567890',
    attribute: 'name',
    value: 'Jesus Christ',
  },
]
