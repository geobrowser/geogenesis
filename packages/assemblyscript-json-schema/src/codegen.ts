import { JSONSchema7 } from 'json-schema'

import {
  findRefs,
  getAnyOfTypeNames,
  getDefinition,
  getRefName,
  getUnionsContainingType,
  unique,
} from './schemaUtils'

function generateImport(name: string) {
  return `import { ${name} } from "./${name}"`
}

export function generateUnionType(
  schema: JSONSchema7,
  name: string,
  definition: JSONSchema7
) {
  const anyOfTypeNames = getAnyOfTypeNames(definition)

  return `
  export class ${name} {
    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) return null
      const __obj = <JSON.Obj>__json
      const type = __obj.getString('type')
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
  const importedNames = unique([
    ...findRefs(definition).map(getRefName),
    ...unions,
  ])

  return `
  ${importedNames.map(generateImport).join('\n')}

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
            value as JSONSchema7
          )}
          if (__${property} == null) return null
          `
          if ((value as JSONSchema7).type === 'array') {
            const itemType = (value as JSONSchema7).items! as JSONSchema7
            const refName = getRefName(itemType.$ref!)
            result += `const __${property}Array = __${property}.valueOf()
            const ${property} = mapOrNull<JSON.Value, ${refName}>(
              __${property}Array,
              (item: JSON.Value): ${refName} | null => ${refName}.fromJSON(item)
            )
            if (!${property}) return null`
          } else if ((value as JSONSchema7).$ref) {
            const refName = getRefName((value as JSONSchema7).$ref!)
            result += `const ${property} = ${refName}.fromJSON(item)
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
      const name = getRefName((property.items as JSONSchema7).$ref!)
      return `${name}[]`
  }

  if (property.$ref) {
    return getRefName(property.$ref)
  }

  throw new Error(`Failed to get type name: ${JSON.stringify(property)}`)
}

function getDecoderFunction(property: string, value: JSONSchema7) {
  if (typeof value.type === 'string') {
    switch (value.type) {
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

  if (typeof value.$ref === 'string') {
    return `__obj.getObj("${property}")`
  }

  throw new Error(`Unsupported property: ${JSON.stringify(value)}`)
}
