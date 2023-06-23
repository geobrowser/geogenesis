import { JSON } from 'assemblyscript-json/assembly'
import { Root } from './types'

export * from './types'

/**
 * Test that we can decode and encode json as the Root object
 */
export function testRootSerialization(json: string): string | null {
  let value: JSON.Value = <JSON.Value>JSON.parse(json)
  let root = Root.fromJSON(value)
  if (!root) return null
  const serialized = root.toJSON()
  return serialized.stringify()
}
