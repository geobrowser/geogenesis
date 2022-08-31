export type NFTMetadataAttributeType = 'string' | 'number' | 'boolean'

export type NFTMetadataAttribute = {
  trait_type: string
  value: string | number | boolean
}

export type NFTMetadata = {
  name?: string
  description?: string
  image?: string
  external_url?: string
  animation_url?: string
  attributes?: NFTMetadataAttribute[]
}
