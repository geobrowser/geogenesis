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
    }
  )

const root: Root = {
  type: 'root',
  commands: [],
}

;(async () => {
  const { test } = await loadAssembly()

  const result = await test(JSON.stringify(root))

  console.log('OK!', result)
})()
