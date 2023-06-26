import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { Value } from './Value'
import { Action } from './Action'

export class DeleteTripleAction extends Action {
  entityId: string
  attributeId: string
  value: Value

  constructor(entityId: string, attributeId: string, value: Value) {
    super('deleteTriple')
    this.entityId = entityId
    this.attributeId = attributeId
    this.value = value
  }

  toJSON(): JSON.Value {
    const __obj = new JSON.Obj()
    const type = new JSON.Str(this.type)
    __obj.set('type', type)
    const entityId = new JSON.Str(this.entityId)
    __obj.set('entityId', entityId)
    const attributeId = new JSON.Str(this.attributeId)
    __obj.set('attributeId', attributeId)
    const value = this.value.toJSON()
    __obj.set('value', value)

    return __obj
  }

  static fromJSON(__json: JSON.Value): DeleteTripleAction | null {
    if (!__json.isObj) {
      log.debug('DeleteTripleAction.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    let __type = __obj.getString('type')

    if (__type == null) {
      log.debug('DeleteTripleAction.fromJSON(): __type is null', [])
      return null
    }
    const type = __type.valueOf()
    let __entityId = __obj.getString('entityId')

    if (__entityId == null) {
      log.debug('DeleteTripleAction.fromJSON(): __entityId is null', [])
      return null
    }
    const entityId = __entityId.valueOf()
    let __attributeId = __obj.getString('attributeId')

    if (__attributeId == null) {
      log.debug('DeleteTripleAction.fromJSON(): __attributeId is null', [])
      return null
    }
    const attributeId = __attributeId.valueOf()
    let __value = __obj.getObj('value')

    if (__value == null) {
      log.debug('DeleteTripleAction.fromJSON(): __value is null', [])
      return null
    }
    const value = Value.fromJSON(__value)
    if (value == null) {
      log.debug('DeleteTripleAction.fromJSON(): __value is null', [])
      return null
    }

    return new DeleteTripleAction(entityId, attributeId, value)
  }
}
