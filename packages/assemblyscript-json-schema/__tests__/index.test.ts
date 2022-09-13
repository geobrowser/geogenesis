import { createFs, toJSON } from 'buffs'
import 'jest'
import { JSONSchema7 } from 'json-schema'
import { generate, Paths } from '../src'

const paths: Paths = {
  schemaPath: '/schema.json',
  outputPath: '/dist',
  staticPath: '/static',
}

const simple: JSONSchema7 = {
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
  },
}

it('generates files', async () => {
  const inputFs = createFs({
    [`/schema.json`]: JSON.stringify(simple),
    ['/static']: null,
  })

  const outputFs = createFs()

  await generate({ inputFs, outputFs, paths })

  expect(toJSON(outputFs)).toMatchSnapshot()
})
