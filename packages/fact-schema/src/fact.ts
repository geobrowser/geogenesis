export interface Root {
  type: 'root'
  commands: Command[]
}

type Command = CreateCommand | DeleteCommand

interface CreateCommand {
  type: 'create'
  value: Fact
}

interface DeleteCommand {
  type: 'delete'
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
