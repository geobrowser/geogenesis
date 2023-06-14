import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { Value } from './Value'

export class DateValue extends Value {
  id: string
  value: string[]

  constructor(id: string, value: string[]) {
    super('date')
    this.id = id
    this.value = value
  }

  toJSON(): JSON.Value {
    const __obj = new JSON.Obj()
    const type = new JSON.Str(this.type)
    __obj.set('type', type)
    const id = new JSON.Str(this.id)
    __obj.set('id', id)
    const value = new JSON.Arr()

    for (let i = 0; i < this.value.length; i++) {
      value.push(new JSON.Str(this.value[i]))
    }

    __obj.set('value', value)

    return __obj
  }

  static fromJSON(__json: JSON.Value): DateValue | null {
    if (!__json.isObj) {
      log.debug('DateValue.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    let __type = __obj.getString('type')

    if (__type == null) {
      log.debug('DateValue.fromJSON(): __type is null', [])
      return null
    }
    const type = __type.valueOf()
    let __id = __obj.getString('id')

    if (__id == null) {
      log.debug('DateValue.fromJSON(): __id is null', [])
      return null
    }
    const id = __id.valueOf()
    let __value = __obj.getArr('value')

    if (__value == null) {
      log.debug('DateValue.fromJSON(): __value is null', [])
      return null
    }
    const value = __value.valueOf()

    const val: string[] = []

    for (let i = 0; i < value.length; i++) {
      val.push(value[i].toString())
    }

    return new DateValue(id, val)
  }
}
