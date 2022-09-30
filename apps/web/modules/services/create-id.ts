import { v4, validate, version } from 'uuid';
import { Triple, Value } from '../types';

export function createEntityId() {
  return v4();
}

/**
 * Values are encoded into ids by adding a type prefix to the beginning
 */
function createValueId(value: Value): string {
  switch (value.type) {
    case 'entity':
      return `e~${value.value}`;
    case 'string':
      return `s~${value.value}`;
    case 'number':
      return `n~${value.value}`;
  }
}

/**
 * Triple id encoding should match between client and network.
 * As a future improvement, we could try to run the same code between assemblyscript/typescript.
 */
export function createTripleId(entityId: string, attributeId: string, value: Value): string;
export function createTripleId(triple: Triple): string;
export function createTripleId(
  ...args: [entityId: string, attributeId: string, value: Value] | [triple: Triple]
): string {
  if (args.length === 1) {
    const triple = args[0];
    return createTripleId(triple.entityId, triple.attributeId, triple.value);
  }

  return `${args[0]}:${args[1]}:${createValueId(args[2])}`;
}

export function createTripleWithId(entityId: string, attributeId: string, value: Value): Triple {
  return {
    id: createTripleId(entityId, attributeId, value),
    entityId,
    attributeId,
    value,
  };
}

export const BUILTIN_ENTITY_IDS = ['name', 'type'];

function isValidUuid(uuid: string) {
  return validate(uuid) && version(uuid) === 4;
}

export function isValidEntityId(id: string) {
  return isValidUuid(id) || BUILTIN_ENTITY_IDS.includes(id);
}
