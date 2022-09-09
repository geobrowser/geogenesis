import arg from 'arg'
import { generate } from './index'

export async function cli({ argv }: { argv: string[] }) {
  const result = arg(
    {
      '--help': Boolean,
      '--schema': String,
      '--output': String,
      '--static': String,
    },
    { argv }
  )

  const { '--schema': schema, '--output': output, '--static': static_ } = result

  if (result['--help']) {
    console.log(
      `assemblyscript-json-schema --schema <SCHEMA_PATH> --static <STATIC_PATH> --output <OUTPUT_PATH>`
    )
    return process.exit(0)
  }

  if (!schema) {
    console.error(`Missing 'schema' arg`)
    return process.exit(1)
  }
  if (!output) {
    console.error(`Missing 'output' arg`)
    return process.exit(1)
  }

  generate({
    paths: {
      schemaPath: schema,
      outputPath: output,
      staticPath: static_,
    },
  })
}
