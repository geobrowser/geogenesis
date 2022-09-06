import assert from 'assert'
import { readFileSync } from 'fs'
import { instantiate, __AdaptedExports as AssemblyExports } from '../build/test'

const loadAssembly = async (): Promise<typeof AssemblyExports> =>
  await instantiate(
    await WebAssembly.compile(readFileSync('build/test.wasm')),
    {
      env: {
        abort: () => {
          throw 'abort'
        },
      },
    }
  )

const helloWorldBytes = new TextEncoder().encode('Hello world')
const helloWorldBase64 = Buffer.from(helloWorldBytes).toString('base64')

;(async () => {
  const { mimeType, data } = await loadAssembly()

  const base64Text = `data:text/plain;base64,${helloWorldBase64}`

  assert.equal(await mimeType(base64Text), 'text/plain')
  assert.deepEqual(await data(base64Text), helloWorldBytes)
})()
