import { describe, expect, it } from 'vitest'
import { FactSchema, Root } from '../src'

it('validates', () => {
  const data: Root = {
    type: 'root',
    commands: [
      {
        type: 'create',
        value: {
          id: '',
          entityId: '',
          attributeId: '',
          type: 'fact',
          value: { type: 'number', value: 42 },
        },
      },
    ],
  }

  const ok = FactSchema.validate(data)

  expect(ok).toEqual(true)
})

describe('invalid', () => {
  it('is missing properties', () => {
    const data = {
      type: 'root',
    }

    const ok = FactSchema.validate(data)

    expect(ok).toEqual(false)
  })

  it('has extra properties', () => {
    const data = {
      type: 'root',
      hi: true,
    }

    const ok = FactSchema.validate(data)

    expect(ok).toEqual(false)
  })
})
