import { log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { Action } from './Action'
import { mapOrNull } from '../types/collection-utils'

export class Root {
  type: string
  version: string
  actions: Action[]
  name: string

  constructor(type: string, version: string, actions: Action[], name: string) {
    this.type = type
    this.version = version
    this.actions = actions
    this.name = name
  }

  toJSON(): JSON.Value {
    const __obj = new JSON.Obj()
    const type = new JSON.Str(this.type)
    __obj.set('type', type)
    const version = new JSON.Str(this.version)
    __obj.set('version', version)
    const actions = new JSON.Arr()
    for (let i = 0; i < this.actions.length; i++) {
      actions.push(this.actions[i].toJSON())
    }
    __obj.set('actions', actions)
    const name = new JSON.Str(this.name)
    __obj.set('name', name)

    return __obj
  }

  static fromJSON(__json: JSON.Value): Root | null {
    if (!__json.isObj) {
      log.debug('Root.fromJSON(): __json.isObj is false', [])
      return null
    }
    const __obj = __json as JSON.Obj
    let __type = __obj.getString('type')

    if (__type == null) {
      log.debug('Root.fromJSON(): __type is null', [])
      return null
    }
    const type = __type.valueOf()
    let __version = __obj.getString('version')

    if (__version == null) {
      log.debug('Root.fromJSON(): __version is null', [])
      return null
    }
    const version = __version.valueOf()
    let __actions = __obj.getArr('actions')

    if (__actions == null) {
      log.debug('Root.fromJSON(): __actions is null', [])
      return null
    }
    const __actionsArray = __actions.valueOf()
    const actions = mapOrNull<JSON.Value, Action>(
      __actionsArray,
      (item: JSON.Value): Action | null => Action.fromJSON(item)
    )
    if (actions == null) {
      log.debug('Root.fromJSON(): __actions is null', [])
      return null
    }
    let __name = __obj.getString('name')

    if (__name == null) {
      log.debug('Root.fromJSON(): __name is null', [])
    }
    let name: string | null
    if (__name != null) {
      name = __name.valueOf()
    } else {
      name = ''
    }

    return new Root(type, version, actions, name)
  }
}
