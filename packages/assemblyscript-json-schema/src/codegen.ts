import { JSONSchema7 } from 'json-schema'
import {
  getAnyOfTypeNames,
  getDefinition,
  getReferenceName,
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
      .map(
        ([property, value]) =>
          `${property}: ${convertTypeName(schema, value as JSONSchema7)}`
      )
      .join('\n')}
      
    constructor(${Object.entries(properties).map(
      ([property, value]) =>
        `${property}: ${convertTypeName(schema, value as JSONSchema7)}`
    )}) {
      ${Object.keys(properties)
        .map((property) => `this.${property} = ${property}`)
        .join('\n')}
    }

    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) return null
      const __obj = <JSON.Obj>__json
      ${Object.entries(properties)
        .map(([property, value]) => {
          let result = `
          const __${property} = ${getDecoderFunction(
            property,
            (value as JSONSchema7).type
          )}
          if (__${property} == null) return null
          `
          if ((value as JSONSchema7).type === 'array') {
            const itemType = (value as JSONSchema7).items! as JSONSchema7
            const refName = getReferenceName(itemType.$ref!)
            result += `const __${property}Array = __${property}.valueOf()
            const ${property} = mapOrNull<JSON.Value, ${refName}>(
              __${property}Array,
              (item: JSON.Value): ${refName} | null => ${refName}.fromJSON(item)
            )
            if (!${property}) return null`
          } else {
            result += `const ${property} = __${property}.valueOf()`
          }

          return result.trim()
        })
        .join('\n')}

      return new ${name}(
        ${Object.keys(properties)}
      )
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

function convertTypeName(schema: JSONSchema7, property: JSONSchema7) {
  switch (property.type) {
    case 'boolean':
    case 'number':
    case 'string':
      return property.type
    case 'array':
      const name = getReferenceName((property.items as JSONSchema7).$ref!)
      return `${name}[]`
  }
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
      case 'array':
        return `__obj.getArr("${property}")`
      default:
        break
    }
  }

  throw new Error(`Unsupported 'type': ${JSON.stringify(type)}`)
}
