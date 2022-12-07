import Ajv from 'ajv'
import schema from '../build/schema.json'
import { Root } from './action'

const ajv = new Ajv()

export * from './action'

export const ActionSchema = {
	schema,
	validate: ajv.compile<Root>(schema),
}
