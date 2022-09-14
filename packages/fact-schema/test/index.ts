import assert from 'assert'
import { readFileSync } from 'fs'
import { instantiate, __AdaptedExports as AssemblyExports } from '../build/test'
import { Root } from '../src'

const loadAssembly = async (): Promise<typeof AssemblyExports> =>
  await instantiate(
    await WebAssembly.compile(readFileSync('build/test.wasm')),
    {
      env: {
        abort: () => {
          throw 'abort'
        },
      },
      index: {
        log: {
          log: (level: number, msg: string) =>
            console.log(`WASM log (${level}): ${msg}`),
        },
      },
    }
  )

const root: Root = {
  type: 'root',
  commands: [
    {
      type: 'create',
      value: {
        type: 'fact',
        id: 'i',
        entityId: 'e',
        attributeId: 'a',
        value: {
          type: 'string',
          value: 'hi',
        },
      },
    },
    {
      type: 'create',
      value: {
        type: 'fact',
        id: 'i',
        entityId: 'e',
        attributeId: 'a',
        value: {
          type: 'number',
          value: 42,
        },
      },
    },
  ],
}

;(async () => {
  const { testRootSerialization } = await loadAssembly()

  const result = await testRootSerialization(JSON.stringify(root))

  assert.deepEqual(JSON.parse(result!), root)
})()
