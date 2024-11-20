export function parseEntityFromGraphScheme(value: string): string {
  const entity = value.split('graph://')?.[1]?.split('?')[0]

  if (!entity) {
    throw new Error("Could not parse entity id from graph scheme URI")
  }

  return entity
}
