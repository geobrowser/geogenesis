export interface Root {
  type: 'root'
  actions: Action[]
}

type Action = CreateEntityAction | CreateTripleAction

interface CreateTripleAction {
  type: 'createTriple'
  value: Fact
}

interface CreateEntityAction {
  type: 'createEntity'
  value: Fact
}

interface Fact {
  type: 'fact'
  id: string
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
