import assert from 'assert'
import { readFileSync } from 'fs'
import { instantiate, __AdaptedExports as AssemblyExports } from '../build/test'
import { Root } from '../src'

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

const root: Root = {
	type: 'root',
	version: '0.0.1',
	actions: [
		{
			type: 'createTriple',
			entityId: 'e',
			attributeId: 'a',
			value: {
				type: 'string',
				value: 'hi',
				id: 'v',
			},
		},
		{
			type: 'createTriple',
			entityId: 'e',
			attributeId: 'a',
			value: {
				type: 'number',
				value: '42',
				id: 'v',
			},
		},
	],
}
;(async () => {
	const { testRootSerialization } = await loadAssembly()

	const result = await testRootSerialization(JSON.stringify(root))

	assert.deepEqual(JSON.parse(result!), root)
})()
