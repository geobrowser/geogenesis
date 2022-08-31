import { CSSProperties } from 'react'
import { NFTMetadata } from '../api/nft'

export function NFTImage({
  metadata,
  maxWidth,
  minWidth,
}: {
  metadata: NFTMetadata
  maxWidth: CSSProperties['maxWidth']
  minWidth: CSSProperties['minWidth']
}) {
  return (
    <div
      style={{
        maxWidth,
        minWidth,
        aspectRatio: '1/1',
        overflow: 'hidden',
        borderRadius: 16,
        background: 'white',
        boxShadow: '0 8px 14px 3px rgba(28,28,28,0.1)',
      }}
    >
      <img src={metadata.image || ''} alt="NFT Image" />
    </div>
  )
}
