import { describe, expect, it } from 'vitest'
import { ActionSchema, Root } from '../src'

it('validates', () => {
	const data: Root = {
		type: 'root',
		version: '0.0.1',
		actions: [
			{
				type: 'createTriple',
				entityId: 'e',
				attributeId: 'a',
				value: { type: 'number', value: '42', id: 'v' },
			},
		],
	}

	const ok = ActionSchema.validate(data)

	expect(ok).toEqual(true)
})

describe('invalid', () => {
	it('is missing properties', () => {
		const data = {
			type: 'root',
		}

		const ok = ActionSchema.validate(data)

		expect(ok).toEqual(false)
	})

	it('has extra properties', () => {
		const data = {
			type: 'root',
			hi: true,
		}

		const ok = ActionSchema.validate(data)

		expect(ok).toEqual(false)
	})
})
