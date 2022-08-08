import { NFTMetadata } from '../api/nft'

export function NFTCard({ metadata }: { metadata: NFTMetadata }) {
  // <h1>{metadata.name}</h1>
  // <h2>{metadata.description}</h2>

  return (
    <div
      style={{
        maxWidth: 400,
        minWidth: 200,
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
