import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { CreateEntityAction } from './CreateEntityAction'
import { CreateTripleAction } from './CreateTripleAction'
import { DeleteTripleAction } from './DeleteTripleAction'

export class Action {
  type: string

  constructor(type: string) {
    this.type = type
  }

  asCreateEntityAction(): CreateEntityAction | null {
    return this.type == 'createEntity'
      ? (this as unknown as CreateEntityAction)
      : null
  }

  asCreateTripleAction(): CreateTripleAction | null {
    return this.type == 'createTriple'
      ? (this as unknown as CreateTripleAction)
      : null
  }

  asDeleteTripleAction(): DeleteTripleAction | null {
    return this.type == 'deleteTriple'
      ? (this as unknown as DeleteTripleAction)
      : null
  }

  toJSON(): JSON.Value {
    if (this.type == 'createEntity')
      return (this as unknown as CreateEntityAction).toJSON()
    if (this.type == 'createTriple')
      return (this as unknown as CreateTripleAction).toJSON()
    if (this.type == 'deleteTriple')
      return (this as unknown as DeleteTripleAction).toJSON()
    throw `undefined variant of: Action.${this.type}`
  }

  static fromJSON(__json: JSON.Value): Action | null {
    if (!__json.isObj) {
      log.debug('Action.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    const type = __obj.getString('type')
    if (type == null) {
      log.debug('Action.fromJSON(): type is null', [])
      return null
    }
    const typeName = type.valueOf()
    if (typeName == 'createEntity') return CreateEntityAction.fromJSON(__json)
    if (typeName == 'createTriple') return CreateTripleAction.fromJSON(__json)
    if (typeName == 'deleteTriple') return DeleteTripleAction.fromJSON(__json)
    log.debug(`Action.fromJSON(): unhandled variant '${typeName}'`, [])
    return null
  }
}
