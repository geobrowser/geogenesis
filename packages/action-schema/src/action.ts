export interface Root {
  type: 'root'
  version: string
  actions: Action[]
}

type Action = CreateEntityAction | CreateTripleAction | DeleteTripleAction

interface CreateEntityAction {
  type: 'createEntity'
  entityId: string
}

interface CreateTripleAction {
  type: 'createTriple'
  entityId: string
  attributeId: string
  value: Value
}

interface DeleteTripleAction {
  type: 'deleteTriple'
  entityId: string
  attributeId: string
  value: Value
}

interface NumberValue {
  type: 'number'
  value: string
}

interface StringValue {
  type: 'string'
  value: string
}

interface EntityValue {
  type: 'entity'
  value: string
}

type Value = NumberValue | StringValue | EntityValue
