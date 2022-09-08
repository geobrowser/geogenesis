import 'jest'
import { JSONSchema7 } from 'json-schema'
import { generateType } from '../src/codegen'
import { formatTypeScript } from '../src/format'
import { getUnionsContainingType } from '../src/schemaUtils'

const schema: JSONSchema7 = {
  $ref: '#/definitions/Root',
  $schema: 'http://json-schema.org/draft-07/schema#',
  definitions: {
    NumberValue: {
      properties: {
        type: {
          const: 'number',
          type: 'string',
        },
        value: {
          type: 'number',
        },
      },
      required: ['type', 'value'],
      type: 'object',
    },
    StringValue: {
      properties: {
        type: {
          const: 'string',
          type: 'string',
        },
        value: {
          type: 'string',
        },
      },
      required: ['type', 'value'],
      type: 'object',
    },
    Value: {
      anyOf: [
        {
          $ref: '#/definitions/NumberValue',
        },
        {
          $ref: '#/definitions/StringValue',
        },
      ],
    },
    ValuesContainer: {
      properties: {
        values: {
          items: {
            $ref: '#/definitions/Value',
          },
          type: 'array',
        },
        type: {
          const: 'ValuesContainer',
          type: 'string',
        },
      },
      required: ['type', 'values'],
      type: 'object',
    },
  },
}

it('generates object type', async () => {
  const types = formatTypeScript(generateType(schema, 'NumberValue'))

  expect(types).toMatchSnapshot()
})

it('generates union type', async () => {
  const containing = getUnionsContainingType(schema, 'NumberValue')

  expect(containing).toEqual(['Value'])

  const types = formatTypeScript(generateType(schema, 'Value'))

  expect(types).toMatchSnapshot()
})

it('generates array type', async () => {
  const types = formatTypeScript(generateType(schema, 'ValuesContainer'))

  expect(types).toMatchSnapshot()
})
