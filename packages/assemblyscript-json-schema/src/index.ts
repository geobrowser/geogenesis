import { copy, createFs, IFS } from 'buffs'
import { JSONSchema7 } from 'json-schema'
import path from 'path'
import { generateType } from './codegen'
import { formatDirectory } from './format'

export interface Paths {
  schemaPath: string
  outputPath: string
  staticPath?: string
}

type Configuration = {
  paths: Paths
  inputFs?: IFS
  outputFs?: IFS
}

export async function generate({
  paths,
  inputFs = require('fs'),
  outputFs = require('fs'),
}: Configuration) {
  const schemaString = await inputFs.promises.readFile(paths.schemaPath, 'utf8')
  const schema = JSON.parse(schemaString) as JSONSchema7

  const generatedTypes = getTypeNames(schema).map((name) => [
    `/${name}.ts`,
    generateType(schema, name),
  ])

  const generatedFs = createFs(Object.fromEntries(generatedTypes))

  const staticPath = paths.staticPath ?? path.join(__dirname, '../static')

  // Copy all static files
  copy(inputFs, generatedFs, staticPath, '/')

  await generateIndexFile(generatedFs, '/')
  await formatDirectory(generatedFs, '/')

  // Write the generated files to the output fs
  copy(generatedFs, outputFs, '/', paths.outputPath)
}

export function getTypeNames(schema: JSONSchema7) {
  return Object.keys(schema.definitions ?? {})
}

/**
 * Generate an index file that re-exports all the source files in a directory
 */
async function generateIndexFile(fs: IFS, directoryPath: string) {
  const files = await fs.promises.readdir(directoryPath, 'utf8')

  const source = files
    .map((name) => `export * from "./${path.basename(name, '.ts')}"`)
    .join('\n')

  await fs.promises.writeFile(path.join(directoryPath, 'index.ts'), source)
}
