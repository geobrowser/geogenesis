import Ajv from 'ajv'
import schema from '../build/schema.json'
import { Root } from '../src/fact'

const ajv = new Ajv()

export * from './fact'

export const FactSchema = {
  schema,
  validate: ajv.compile<Root>(schema),
}
