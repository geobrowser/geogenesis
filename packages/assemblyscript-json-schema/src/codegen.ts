import { JSONSchema7 } from 'json-schema'

export function generateType(name: string, definition: JSONSchema7) {
  const { properties = {} } = definition

  return `
  class ${name} {
    ${Object.entries(properties)
      .map(([property, value]) => `${property}: ${(value as JSONSchema7).type}`)
      .join('\n')}
      
    constructor(${Object.entries(properties).map(
      ([property, value]) => `${property}: ${(value as JSONSchema7).type}`
    )}) {
      ${Object.keys(properties)
        .map((property) => `this.${property} = ${property}`)
        .join('\n')}
    }

    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) return null
      const __obj = <JSON.Obj>__json
      ${Object.entries(properties)
        .map(
          ([property, value]) =>
            `const ${property} = ${getDecoderFunction(
              property,
              (value as JSONSchema7).type
            )}`
        )
        .join('\n')}

      if (${Object.keys(properties)
        .map((property) => `${property} == null`)
        .join(' || ')}) {
          return null;
        }

      return new ${name}(type.valueOf())
    }
  }
  `
}

function getDecoderFunction(property: string, type: JSONSchema7['type']) {
  if (typeof type === 'string') {
    switch (type) {
      case 'number':
        return `__obj.getNum("${property}")`
      case 'string':
        return `__obj.getString("${property}")`
      case 'boolean':
        return `__obj.getBool("${property}")`
      default:
        break
    }
  }

  throw new Error(`Unsupported 'type': ${JSON.stringify(type)}`)
}
