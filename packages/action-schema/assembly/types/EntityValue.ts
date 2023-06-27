import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { Value } from './Value'

export class EntityValue extends Value {
  id: string

  constructor(id: string) {
    super('entity')
    this.id = id
  }

  toJSON(): JSON.Value {
    const __obj = new JSON.Obj()
    const type = new JSON.Str(this.type)
    __obj.set('type', type)
    const id = new JSON.Str(this.id)
    __obj.set('id', id)

    return __obj
  }

  static fromJSON(__json: JSON.Value): EntityValue | null {
    if (!__json.isObj) {
      log.debug('EntityValue.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    let __type = __obj.getString('type')

    if (__type == null) {
      log.debug('EntityValue.fromJSON(): __type is null', [])
      return null
    }
    const type = __type.valueOf()
    let __id = __obj.getString('id')

    if (__id == null) {
      log.debug('EntityValue.fromJSON(): __id is null', [])
      return null
    }
    const id = __id.valueOf()

    return new EntityValue(id)
  }
}
