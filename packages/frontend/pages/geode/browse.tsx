import range from 'lodash.range'
import { GetServerSideProps } from 'next'
import { chain } from 'wagmi'
import { getEtherActorURL } from '~/modules/api/ether-actor'
import { BoxParameters, fetchGeodeInner } from '~/modules/api/geode'
import { NFTMetadata } from '~/modules/api/nft'
import { NFTImage } from '~/modules/ui/nft-image'
import { getContractAddress } from '~/modules/utils/getContractAddress'

interface ServerProps {
  data?: {
    contractAddress: string
    totalSupply: number
    tokens: {
      id: number
      metadata: NFTMetadata
      target: BoxParameters
    }[]
  }
  error?: { message: string }
}

export default function Browse(props: ServerProps) {
  if (!props.data) return null

  const { contractAddress, totalSupply, tokens } = props.data

  console.log(tokens)

  return (
    <div className="layout">
      <div>
        {totalSupply} Geode{totalSupply === 1 ? '' : 's'}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        {tokens.map((token) => (
          <div key={token.id}>
            <h3>ID: {token.id}</h3>
            <a
              style={{ flex: 1 }}
              href={`/nft/${token.target.contractAddress}/${token.target.tokenId}`}
            >
              <NFTImage
                maxWidth={400}
                minWidth={200}
                metadata={token.metadata}
              />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { offset: offsetString = '1', limit: limitString = '5' } = context.query
  const contractAddress = getContractAddress(chain.polygonMumbai, 'Geode')!

  const offset = Number(offsetString)
  const limit = Number(limitString)

  const totalSupplyUrl = getEtherActorURL(
    chain.polygonMumbai,
    contractAddress,
    'totalSupply'
  )

  const host = context.req.headers.host

  try {
    const totalSupply = Number(await (await fetch(totalSupplyUrl)).text())

    const tokenRange = range(offset, Math.min(offset + limit, totalSupply + 1))

    const tokens = await Promise.all(
      tokenRange.map(async (id) => {
        const url = `http://${host}/api/nft/${contractAddress}/${id}`
        const response = await fetch(url)
        const metadata = await response.json()
        const target = await fetchGeodeInner(String(id))
        return { id, metadata, target }
      })
    )

    return {
      props: { data: { contractAddress, totalSupply, tokens } },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
