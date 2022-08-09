import range from 'lodash.range'
import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { chain } from 'wagmi'
import { getEtherActorURL } from '~/modules/api/ether-actor'
import { BoxParameters, fetchGeodeContent } from '~/modules/api/geode'
import { NFTMetadata } from '~/modules/api/nft'
import { fetchPage, Page } from '~/modules/api/page'
import { ReadOnlyEditor } from '~/modules/editor/editor'
import { Avatar } from '~/modules/ui/avatar'
import { NFTImage } from '~/modules/ui/nft-image'
import { NFTMetadataList } from '~/modules/ui/nft-metadata-list'
import { ellipsize } from '~/modules/utils/content'
import { getContractAddress } from '~/modules/utils/getContractAddress'

type ListItem = {
  id: number
  metadata: NFTMetadata
  page?: Page
  target: BoxParameters
}

interface ServerProps {
  data?: {
    contractAddress: string
    totalSupply: number
    tokens: ListItem[]
  }
  error?: { message: string }
}

function PageCard({ page, token }: { page: Page; token: BoxParameters }) {
  const addressOrName = page.ens ?? page.owner

  return (
    <Link href={`/page/${token.tokenId}`}>
      <a style={{ textDecoration: 'none' }}>
        <ReadOnlyEditor content={ellipsize(page.content, 256)} />
        <div style={{ display: 'flex' }}>
          <Avatar addressOrName={addressOrName} />
          <div style={{ flexBasis: 8 }} />
          <div>{addressOrName}</div>
          <div style={{ flex: 1 }} />
          <div>~{page.readingTime}m read</div>
        </div>
        {/* <div>ipfs://{page.cid}</div>
        <div>
          {target.contractAddress}/{target.tokenId}
        </div> */}
      </a>
    </Link>
  )
}

export default function Home(props: ServerProps) {
  if (!props.data) return null

  const { totalSupply, tokens } = props.data

  return (
    <div className="layout">
      <div style={{ gap: 20, display: 'flex', flexDirection: 'column' }}>
        {tokens.map((token) => (
          <div
            key={token.id}
            style={{
              overflow: 'hidden',
              borderRadius: 16,
              background: 'white',
              boxShadow: '0 8px 14px 3px rgba(28,28,28,0.04)',
              padding: 20,
            }}
          >
            {token.page ? (
              <PageCard token={token.target} page={token.page} />
            ) : (
              <a
                style={{ flex: 1, display: 'flex', textDecoration: 'none' }}
                href={`/nft/${token.target.contractAddress}/${token.target.tokenId}`}
              >
                <NFTImage
                  maxWidth={150}
                  minWidth={150}
                  metadata={token.metadata}
                />
                <div style={{ flexBasis: 20 }} />
                <NFTMetadataList
                  metadata={{
                    name: token.metadata.name,
                    description: token.metadata.description,
                  }}
                />
              </a>
            )}
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
        const target = await fetchGeodeContent(String(id))
        let result: ListItem = { id, metadata, target }
        if (
          target.contractAddress ===
          getContractAddress(chain.polygonMumbai, 'GeoDocument')
        ) {
          result.page = await fetchPage(
            chain.polygonMumbai,
            String(target.tokenId)
          )
        }
        return result
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
