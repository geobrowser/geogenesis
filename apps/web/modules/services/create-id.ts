import { v4, validate, version } from 'uuid'
import { OmitStrict, Triple, Value } from '../types'

export function createEntityId() {
	return v4()
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(space: string, entityId: string, attributeId: string, value: Value): string
export function createTripleId(triple: Triple): string
export function createTripleId(
	...args: [space: string, entityId: string, attributeId: string, value: Value] | [triple: Triple]
): string {
	if (args.length === 1) {
		const triple = args[0]
		return createTripleId(triple.space, triple.entityId, triple.attributeId, triple.value)
	}

	return `${args[0]}:${args[1]}:${args[2]}:${args[3].id}`
}

export function createTripleWithId(space: string, entityId: string, attributeId: string, value: Value): Triple
export function createTripleWithId(triple: OmitStrict<Triple, 'id' | 'entityName'>): Triple
export function createTripleWithId(
	...args:
		| [space: string, entityId: string, attributeId: string, value: Value]
		| [triple: OmitStrict<Triple, 'id' | 'entityName'>]
): Triple {
	if (args.length === 1) {
		const triple = args[0]
		return {
			id: createTripleId(triple.space, triple.entityId, triple.attributeId, triple.value),
			entityId: triple.entityId,
			attributeId: triple.attributeId,
			value: triple.value,
			space: triple.space,
			entityName: null,
		}
	}

	return {
		id: createTripleId(args[0], args[1], args[2], args[3]),
		space: args[0],
		entityId: args[1],
		attributeId: args[2],
		value: args[3],
		entityName: null,
	}
}

export function createValueId() {
	return v4()
}

export const BUILTIN_ENTITY_IDS = ['name', 'type', 'attribute', 'space']

function isValidUuid(uuid: string) {
	return validate(uuid) && version(uuid) === 4
}

export function isValidEntityId(id: string) {
	return isValidUuid(id) || BUILTIN_ENTITY_IDS.includes(id)
}
