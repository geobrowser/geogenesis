export class GraphUrl {
  static fromEntityId(entityId: string): `graph://${string}` {
      return `graph://${entityId}`
  }

  static isGraphUrl(value: string): boolean {
    return value.startsWith('graph://')
  }

  static toEntityId(value: string): string {
    const entity = value.split('graph://')?.[1]?.split('?')[0]

    if (!entity) {
      throw new Error(`Could not parse entity id from graph scheme URI: ${value}`)
    }

    return entity
  }
}
