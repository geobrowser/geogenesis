import { JSONSchema7 } from 'json-schema'
import {
  getAnyOfTypeNames,
  getDefinition,
  getUnionsContainingType,
} from './schemaUtils'

export function generateUnionType(
  schema: JSONSchema7,
  name: string,
  definition: JSONSchema7
) {
  const anyOfTypeNames = getAnyOfTypeNames(definition)

  return `
  class ${name} {
    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) return null
      const __obj = <JSON.Obj>__json
      const __type = __obj.getString('type')
      if (!type) return null
      switch (type.valueOf()) {
        ${anyOfTypeNames
          .map(
            (typeName) =>
              `case '${typeName}': return ${typeName}.fromJSON(__json)`
          )
          .join('\n')}
        default: return null;
      }
    }
  }
  `
}

export function generateObjectType(
  schema: JSONSchema7,
  name: string,
  definition: JSONSchema7
) {
  const { properties = {} } = definition
  const unions = getUnionsContainingType(schema, name)

  return `
  ${unions.map((unionName) => `import {${unionName}} from './${unionName}'`)}

  class ${name} ${unions.length > 0 ? `implements ${unions.join(', ')}` : ''} {
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

export function generateType(schema: JSONSchema7, name: string) {
  const definition = getDefinition(schema, name)

  if (definition.properties) {
    return generateObjectType(schema, name, definition)
  }

  if (definition.anyOf) {
    return generateUnionType(schema, name, definition)
  }

  throw new Error(`Unrecognized type: ${name}`)
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
