export interface Root {
  type: 'root'
  version: string
  actions: Action[]
  name?: string
}

type Action = CreateEntityAction | CreateTripleAction | DeleteTripleAction

interface CreateEntityAction {
  type: 'createEntity'
  entityId: string
}

export interface CreateTripleAction {
  type: 'createTriple'
  entityId: string
  attributeId: string
  value: Value
}

export interface DeleteTripleAction {
  type: 'deleteTriple'
  entityId: string
  attributeId: string
  value: Value
}

interface NumberValue {
  type: 'number'
  id: string
  value: string
}

interface StringValue {
  type: 'string'
  id: string
  value: string
}

interface ImageValue {
  type: 'image'
  id: string
  value: string
}

interface EntityValue {
  type: 'entity'
  id: string
}

interface DateValue {
  type: 'date'
  id: string
  value: string
}

type Value = NumberValue | StringValue | EntityValue | ImageValue | DateValue
