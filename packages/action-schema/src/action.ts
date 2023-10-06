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
  value: string // The value of the image is the url where the image is hosted, usually on IPFS
}

interface EntityValue {
  type: 'entity'
  id: string // The id of the EntityValue is the id of the entity the value is referencing
}

interface CollectionValue {
  type: 'collection'
  id: string // The id of the EntityValue is the id of the entity the value is referencing
}

interface DateValue {
  type: 'date'
  id: string
  value: string // This is represented as an ISO-8601 datetime string
}

interface UrlValue {
  type: 'url'
  id: string
  value: string
}

type Value =
  | NumberValue
  | StringValue
  | EntityValue
  | ImageValue
  | DateValue
  | UrlValue
  | CollectionValue
