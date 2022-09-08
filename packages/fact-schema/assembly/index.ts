import { JSON } from 'assemblyscript-json/assembly'
import { mapOrNull } from './collections'

class Command {
  type: string

  constructor(type: string) {
    this.type = type
  }

  toJSON(): JSON.Value {
    const value = new JSON.Obj()
    value.set('type', new JSON.Str(this.type))
    return value
  }

  static fromJSON(json: JSON.Value): Command | null {
    if (!json.isObj) return null
    const obj = <JSON.Obj>json
    const type = obj.getString('type')
    if (!type) return null
    return new Command(type.valueOf())
  }
}

class Root {
  type: string
  commands: Command[]

  constructor(type: string, commands: Command[]) {
    this.type = type
    this.commands = commands
  }

  toJSON(): JSON.Value {
    const value = new JSON.Obj()
    value.set('type', new JSON.Str(this.type))
    const commands = new JSON.Arr()
    for (let i = 0; i < this.commands.length; i++) {
      commands.push(this.commands[i].toJSON())
    }
    value.set('commands', commands)
    return value
  }

  static fromJSON(json: JSON.Value): Root | null {
    if (!json.isObj) return null
    const obj = <JSON.Obj>json
    const type = obj.getString('type')
    const commands = obj.getArr('commands')
    if (!type || !commands) return null
    const commandsArray = commands.valueOf()
    const decodedCommands = mapOrNull<JSON.Value, Command>(
      commandsArray,
      (command: JSON.Value): Command | null => Command.fromJSON(command)
    )
    if (!decodedCommands) return null
    return new Root(type.valueOf(), decodedCommands)
  }
}

export function test(json: string): string | null {
  let value: JSON.Value = <JSON.Value>JSON.parse(json)
  let root = Root.fromJSON(value)
  if (!root) return null
  const serialized = root.toJSON()
  return serialized.stringify()
}
