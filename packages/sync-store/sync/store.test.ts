import { describe, it, expect } from 'vitest'
import { Facts, MockApi } from './store'

describe('Facts store', () => {
  it('Initializes empty', () => {
    const store = new Facts(new MockApi())
    expect(store.facts).toStrictEqual([])
  })

  it('Adds a new fact', () => {
    const store = new Facts(new MockApi())

    const newFact = {
      id: '1',
      entityId: '1',
      attribute: 'name',
      value: 'Jesus Christ',
    }

    store.createFact(newFact)
    expect(store.facts).to.contain(newFact)
  })
})
