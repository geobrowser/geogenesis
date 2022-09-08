import { copy, createFs, IFS } from 'buffs'
import { JSONSchema7 } from 'json-schema'
import { generateType } from './codegen'
import { formatDirectory } from './format'

export interface Paths {
  schemaPath: string
  outputPath: string
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
    generateType(name, schema.definitions![name] as JSONSchema7),
  ])

  const generatedFs = createFs(Object.fromEntries(generatedTypes))

  await formatDirectory(generatedFs, '/')

  // Write the generated files to the output fs
  copy(generatedFs, outputFs, '/', paths.outputPath)
}

export function getTypeNames(schema: JSONSchema7) {
  return Object.keys(schema.definitions ?? {})
}
