import { describe, expect, it } from 'vitest'
import { EntityValue, NumberValue, StringValue } from '../types'
import { createTripleId } from './create-id'

describe('create-id', () => {
	it('createTripleId returns correct id derived from triple with string value', () => {
		const entityId = 'entityId'
		const attributeId = 'attributeId'
		const value: StringValue = { type: 'string', id: 'valueId', value: 'Jesus Christ' }
		expect(createTripleId('space', entityId, attributeId, value)).toBe('space:entityId:attributeId:valueId')
	})

	it('createTripleId returns correct id derived from triple with number value', () => {
		const entityId = 'entityId'
		const attributeId = 'attributeId'
		const value: NumberValue = { type: 'number', id: 'valueId', value: '1920' }
		expect(createTripleId('space', entityId, attributeId, value)).toBe('space:entityId:attributeId:valueId')
	})

	it('createTripleId returns correct id derived from triple with entity value', () => {
		const entityId = 'entityId'
		const attributeId = 'attributeId'
		const value: EntityValue = { type: 'entity', id: '12387' }
		expect(createTripleId('space', entityId, attributeId, value)).toBe('space:entityId:attributeId:12387')
	})
})
