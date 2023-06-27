import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { NumberValue } from './NumberValue'
import { StringValue } from './StringValue'
import { EntityValue } from './EntityValue'
import { ImageValue } from './ImageValue'
import { DateValue } from './DateValue'
import { UrlValue } from './UrlValue'

export class Value {
  type: string

  constructor(type: string) {
    this.type = type
  }

  asNumberValue(): NumberValue | null {
    return this.type == 'number' ? (this as NumberValue) : null
  }

  asStringValue(): StringValue | null {
    return this.type == 'string' ? (this as StringValue) : null
  }

  asEntityValue(): EntityValue | null {
    return this.type == 'entity' ? (this as EntityValue) : null
  }

  asImageValue(): ImageValue | null {
    return this.type == 'image' ? (this as ImageValue) : null
  }

  asDateValue(): DateValue | null {
    return this.type == 'date' ? (this as DateValue) : null
  }

  asUrlValue(): UrlValue | null {
    return this.type == 'url' ? (this as UrlValue) : null
  }

  toJSON(): JSON.Value {
    if (this.type == 'number') return (this as NumberValue).toJSON()
    if (this.type == 'string') return (this as StringValue).toJSON()
    if (this.type == 'entity') return (this as EntityValue).toJSON()
    if (this.type == 'image') return (this as ImageValue).toJSON()
    if (this.type == 'date') return (this as DateValue).toJSON()
    if (this.type == 'url') return (this as UrlValue).toJSON()
    throw `undefined variant of: Value.${this.type}`
  }

  static fromJSON(__json: JSON.Value): Value | null {
    if (!__json.isObj) {
      log.debug('Value.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    const type = __obj.getString('type')
    if (type == null) {
      log.debug('Value.fromJSON(): type is null', [])
      return null
    }
    const typeName = type.valueOf()
    if (typeName == 'number') return NumberValue.fromJSON(__json)
    if (typeName == 'string') return StringValue.fromJSON(__json)
    if (typeName == 'entity') return EntityValue.fromJSON(__json)
    if (typeName == 'image') return ImageValue.fromJSON(__json)
    if (typeName == 'date') return DateValue.fromJSON(__json)
    if (typeName == 'url') return UrlValue.fromJSON(__json)
    log.debug(`Value.fromJSON(): unhandled variant '${typeName}'`, [])
    return null
  }
}
