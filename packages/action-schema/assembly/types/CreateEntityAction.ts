import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { Action } from './Action'

export class CreateEntityAction extends Action {
  entityId: string

  constructor(entityId: string) {
    super('createEntity')
    this.entityId = entityId
  }

  toJSON(): JSON.Value {
    const __obj = new JSON.Obj()
    const type = new JSON.Str(this.type)
    __obj.set('type', type)
    const entityId = new JSON.Str(this.entityId)
    __obj.set('entityId', entityId)

    return __obj
  }

  static fromJSON(__json: JSON.Value): CreateEntityAction | null {
    if (!__json.isObj) {
      log.debug('CreateEntityAction.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    let __type = __obj.getString('type')

    if (__type == null) {
      log.debug('CreateEntityAction.fromJSON(): __type is null', [])
      return null
    }
    const type = __type.valueOf()
    let __entityId = __obj.getString('entityId')

    if (__entityId == null) {
      log.debug('CreateEntityAction.fromJSON(): __entityId is null', [])
      return null
    }
    const entityId = __entityId.valueOf()

    return new CreateEntityAction(entityId)
  }
}
