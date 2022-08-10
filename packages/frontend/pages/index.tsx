import range from 'lodash.range'
import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { chain } from 'wagmi'
import { getEtherActorURL } from '~/modules/api/ether-actor'
import { fetchGeodeItem, GeodeItem } from '~/modules/api/geode-item'
import { Page } from '~/modules/api/page'
import { ReadOnlyEditor } from '~/modules/editor/editor'
import { Avatar } from '~/modules/ui/avatar'
import { NFTImage } from '~/modules/ui/nft-image'
import { NFTMetadataList } from '~/modules/ui/nft-metadata-list'
import { ellipsize } from '~/modules/utils/content'
import { getContractAddress } from '~/modules/utils/getContractAddress'

interface ServerProps {
  data?: {
    contractAddress: string
    totalSupply: number
    items: GeodeItem[]
  }
  error?: { message: string }
}

function PageCard({ geodeId, page }: { geodeId: string; page: Page }) {
  const addressOrName = page.ens ?? page.owner

  return (
    <>
      <ReadOnlyEditor
        class="editor-card"
        content={ellipsize(page.content, 256)}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="mr-2">
            <Avatar addressOrName={addressOrName} />
          </div>
          {/* 
                margin-top to fix weird alignment issue where text is not optically aligned
                even though it's technically aligned.
            */}
          <p className="geo-text-subheadline font-bold mt-0.5">
            {addressOrName}
          </p>
        </div>
        <p className="text-geo-grey-32 geo-text-subheadline font-bold">
          ~{page.readingTime}m read
        </p>
      </div>
      {/* <div>ipfs://{page.cid}</div>
        <div>
          {target.contractAddress}/{target.tokenId}
        </div> */}
    </>
  )
}

export default function Home(props: ServerProps) {
  if (!props.data) return null

  const { totalSupply, items } = props.data

  return (
    <div className="layout">
      <div className="flex flex-col space-y-4">
        {items.map((item) => (
          <div
            key={item.geodeId}
            className="overflow-hidden rounded-2xl bg-geo-white-100 shadow-lg p-5"
          >
            <Link href={`/page/${item.geodeId}`}>
              <a className="no-underline">
                {item.page ? (
                  <PageCard geodeId={item.geodeId} page={item.page} />
                ) : (
                  <div className="flex no-underline">
                    <NFTImage
                      maxWidth={150}
                      minWidth={150}
                      metadata={item.innerMetadata}
                    />
                    <div style={{ flexBasis: 20 }} />
                    <NFTMetadataList
                      metadata={{
                        name: item.innerMetadata.name,
                        description: item.innerMetadata.description,
                      }}
                    />
                  </div>
                )}
              </a>
            </Link>
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

  const host = context.req.headers.host!

  try {
    const totalSupply = Number(await (await fetch(totalSupplyUrl)).text())

    const tokenRange = range(
      offset,
      Math.min(offset + limit, totalSupply + 1)
    ).map(String)

    const tokens = await Promise.all(
      tokenRange.map((id) => fetchGeodeItem(host, id))
    )

    return {
      props: { data: { contractAddress, totalSupply, items: tokens } },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
