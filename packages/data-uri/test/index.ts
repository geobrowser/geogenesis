import assert from 'assert'
import { readFileSync } from 'fs'
import { instantiate, __AdaptedExports as AssemblyExports } from '../build/test'

const loadAssembly = async (): Promise<typeof AssemblyExports> =>
	await instantiate(await WebAssembly.compile(readFileSync('build/test.wasm')), {
		env: {
			abort: () => {
				throw 'abort'
			},
		},
		index: {
			log: {
				log: (level: number, msg: string) => console.log(`WASM log (${level}): ${msg}`),
			},
		},
	})

const helloWorldBytes = new TextEncoder().encode('Hello, World!')
const helloWorldBase64 = Buffer.from(helloWorldBytes).toString('base64')
;(async () => {
	const { mimeType, data } = await loadAssembly()

	const base64Text = `data:text/plain;base64,${helloWorldBase64}`

	assert.equal(await mimeType(base64Text), 'text/plain')
	assert.deepEqual(await data(base64Text), helloWorldBytes)
})()
