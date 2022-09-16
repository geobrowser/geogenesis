import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Facts, MockApi } from './store'
import { useSharedObservable } from './hook'

describe('useSharedObservable', () => {
  it('Initializes empty', () => {
    const store = new Facts(new MockApi())
    const { result } = renderHook(() => useSharedObservable(store.facts$))
    expect(result.current).toStrictEqual([])
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

    const { result } = renderHook(() => useSharedObservable(store.facts$))
    expect(result.current).to.contain(newFact)
  })
})
