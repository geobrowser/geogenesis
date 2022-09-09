import { JSONSchema7 } from 'json-schema'

import {
  findRefs,
  getAnyOfTypeNames,
  getDefinition,
  getDiscriminator,
  getRefName,
  getUnionsContainingType,
  hasArrayOfComplexTypes,
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
  import { log } from '@graphprotocol/graph-ts'
  import { JSON } from 'assemblyscript-json/assembly'
  ${anyOfTypeNames.map(generateImport).join('\n')}

  export class ${name} {
    type: string

    constructor(type: string) {
      this.type = type;
    } 

    toJSON(): JSON.Value {
      const typeName = this.type;
      ${anyOfTypeNames
        .map(
          (typeName) =>
            `if (typeName == '${getDiscriminator(
              getDefinition(schema, typeName)
            )}') return (this as ${typeName}).toJSON()`
        )
        .join('\n')}
      throw "undefined variant of: ${name}"
    }

    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) {
        log.debug("${name}.fromJSON(): __json.isObj is false", [])
        return null
      }
      const __obj = <JSON.Obj>__json
      const type = __obj.getString('type')
      if (type == null) {
        log.debug("${name}.fromJSON(): type is null", [])
        return null
      }
      const typeName = type.valueOf()
      ${anyOfTypeNames
        .map(
          (typeName) =>
            `if (typeName == '${getDiscriminator(
              getDefinition(schema, typeName)
            )}') return ${typeName}.fromJSON(__json)`
        )
        .join('\n')}
      log.debug(\`${name}.fromJSON(): unhandled variant '\${typeName}'\`, [])
      return null;
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
  import { log } from '@graphprotocol/graph-ts'
  import { JSON } from 'assemblyscript-json/assembly'
  ${importedNames.map(generateImport).join('\n')}
  ${
    hasArrayOfComplexTypes(definition)
      ? `import { mapOrNull } from "./collection-utils"`
      : ''
  }  

  export class ${name} ${
    unions.length > 0 ? `extends ${unions.join(', ')}` : ''
  } {
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
      ${unions.length > 0 ? 'super(type)' : ''}
      ${Object.keys(properties)
        .map((property) => `this.${property} = ${property}`)
        .join('\n')}
    }

    toJSON(): JSON.Value {
      const __obj = new JSON.Obj()
      ${Object.entries(properties)
        .map(([property, value]) => {
          let result = ``

          if ((value as JSONSchema7).type === 'array') {
            result += `const ${property} = new JSON.Arr()
            for (let i = 0; i < this.${property}.length; i++) {
              ${property}.push(this.${property}[i].toJSON())
            }`
          } else if ((value as JSONSchema7).$ref) {
            result += `const ${property} = this.${property}.toJSON()`
          } else {
            result += `const ${property} = ${getEncoderFunction(
              value as JSONSchema7
            )}(this.${property})`
          }

          result += `
          __obj.set('${property}', ${property})
          `

          return result.trim()
        })
        .join('\n')}

      return __obj
    }

    static fromJSON(__json: JSON.Value): ${name} | null {
      if (!__json.isObj) {
        log.debug("${name}.fromJSON(): __json.isObj is false", [])
        return null
      }
      const __obj = __json as JSON.Obj
      ${Object.entries(properties)
        .map(([property, value]) => {
          let result = `
          const __${property} = ${getDecoderFunction(
            property,
            value as JSONSchema7
          )}
          if (__${property} == null) {
            log.debug("${name}.fromJSON(): __${property} is null", [])
            return null
          }
          `
          if ((value as JSONSchema7).type === 'array') {
            const itemType = (value as JSONSchema7).items! as JSONSchema7
            const refName = getRefName(itemType.$ref!)
            result += `const __${property}Array = __${property}.valueOf()
            const ${property} = mapOrNull<JSON.Value, ${refName}>(
              __${property}Array,
              (item: JSON.Value): ${refName} | null => ${refName}.fromJSON(item)
            )
            if (${property} == null) {
              log.debug("${name}.fromJSON(): __${property} is null", [])
              return null
            }`
          } else if ((value as JSONSchema7).$ref) {
            const refName = getRefName((value as JSONSchema7).$ref!)
            result += `const ${property} = ${refName}.fromJSON(__${property})
            if (${property} == null) {
              log.debug("${name}.fromJSON(): __${property} is null", [])
              return null
            }`
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

function getEncoderFunction(value: JSONSchema7) {
  if (typeof value.type === 'string') {
    switch (value.type) {
      case 'number':
        return `new JSON.Num`
      case 'string':
        return `new JSON.Str`
      case 'boolean':
        return `new JSON.Bool`
      case 'array':
        return `new JSON.Arr`
      default:
        break
    }
  }

  if (typeof value.$ref === 'string') {
    return `new JSON.Obj`
  }

  throw new Error(`Unsupported property: ${JSON.stringify(value)}`)
}
