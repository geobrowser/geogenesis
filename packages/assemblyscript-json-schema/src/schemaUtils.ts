import { JSONSchema7 } from 'json-schema'
import get from 'lodash.get'
import { withOptions } from 'tree-visit'

type JSONValue =
  | null
  | boolean
  | number
  | string
  | { [x: string]: JSONValue }
  | Array<JSONValue>

const traverse = withOptions<[string, JSONValue]>({
  getChildren: ([, value]) => {
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value)
    } else {
      return []
    }
  },
})

export function getTypeNames(schema: JSONSchema7) {
  return Object.keys(schema.definitions ?? {})
}

export function getDefinition(schema: JSONSchema7, name: string): JSONSchema7 {
  const definition = (schema.definitions ?? {})[name]

  if (typeof definition === 'boolean') {
    throw new Error(`Unhandled boolean definition for: ${name}`)
  }

  return definition
}

export function getResolvedReference<T = unknown>(
  schema: JSONSchema7,
  ref: string
): T {
  if (ref.startsWith('#')) {
    const components = ref.split('/').slice(1)
    return get(schema, components)
  }

  throw new Error(`Unable to resolve reference: ${ref}`)
}

export function getRefName($ref: string) {
  return $ref!.split('/').at(-1)!
}

export function getAnyOfTypeNames(definition: JSONSchema7) {
  const anyOf = (definition.anyOf || []).flatMap((schema) =>
    typeof schema === 'boolean' ? [] : [schema]
  )

  if (anyOf.some((option) => !option.$ref)) {
    throw new Error(`Missing anyOf ref in: ${name}`)
  }

  const typeNames = anyOf.map((option) => getRefName(option.$ref!))

  return typeNames
}

export function getUnionsContainingType(schema: JSONSchema7, name: string) {
  const typeNames = getTypeNames(schema)

  const unionTypeNames = typeNames.flatMap((typeName) => {
    const definition = getDefinition(schema, typeName)
    const anyOfTypeNames = getAnyOfTypeNames(definition)

    return anyOfTypeNames.includes(name) ? [typeName] : []
  })

  return unique(unionTypeNames)
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

export function findRefs(schema: JSONSchema7) {
  return unique(
    traverse
      .findAll(['', schema as JSONValue], ([key]) => key === '$ref')
      .flatMap(([, value]) => (typeof value === 'string' ? [value] : []))
  )
}

export function hasArrayOfComplexTypes(schema: JSONSchema7) {
  return !!traverse.find(
    ['', schema as JSONValue],
    ([key, value]) =>
      key === 'items' &&
      typeof value === 'object' &&
      value != null &&
      '$ref' in value
  )
}

export function getDiscriminator(definition: JSONSchema7) {
  const properties = definition.properties || {}
  const typeProperty = properties.type as JSONSchema7 | undefined
  return typeof typeProperty?.const === 'string'
    ? typeProperty.const
    : undefined
}
