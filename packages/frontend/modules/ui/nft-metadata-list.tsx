import { NFTMetadata } from '~/modules/api/nft'

export function NFTMetadataList({ metadata }: { metadata: NFTMetadata }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h1 className="text-geo-largeTitle">{metadata.name}</h1>
      <div style={{ flexBasis: 8 }} />
      {metadata.description && (
        <div className="text-geo-body">{metadata.description}</div>
      )}
      <div style={{ flexBasis: 40 }} />
      <div style={{ opacity: 0.8 }}>
        {metadata.animation_url && (
          <div className="text-geo-body">
            Link: <a href={metadata.animation_url}>{metadata.animation_url}</a>
          </div>
        )}
        {metadata.external_url && (
          <div className="text-geo-body">
            External Link:
            <a href={metadata.external_url}>{metadata.external_url}</a>
          </div>
        )}
      </div>
    </div>
  )
}
