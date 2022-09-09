import arg from 'arg'
import { generate } from './index'

export async function cli({ argv }: { argv: string[] }) {
  const result = arg(
    {
      '--help': Boolean,
      '--schema': String,
      '--output': String,
    },
    { argv }
  )

  const { '--schema': schema, '--output': output } = result

  if (result['--help']) {
    console.log(
      `assemblyscript-json-schema --schema <SCHEMA_PATH> --output <OUTPUT_PATH> `
    )
    return process.exit(0)
  }

  if (!schema) throw new Error(`Missing 'schema' arg`)
  if (!output) throw new Error(`Missing 'output' arg`)

  generate({
    paths: {
      schemaPath: schema,
      outputPath: output,
    },
  })
}
