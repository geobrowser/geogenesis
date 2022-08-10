import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { fetchGeodeItem, GeodeItem } from '~/modules/api/geode-item'
import { Page } from '~/modules/api/page'
import { ReadOnlyEditor } from '~/modules/editor/editor'
import { NFTImage } from '~/modules/ui/nft-image'
import { NFTMetadataList } from '~/modules/ui/nft-metadata-list'

export function GeoDocumentPage({ page }: { page: Page }) {
  const [renderMetadata, setRenderMetadata] = useState(false)

  // In order to do trigger a layout transition on the editor
  // we need to insert the metadata node into the DOM to force
  // the editor position to slide down.
  useEffect(() => {
    setTimeout(() => setRenderMetadata(true), 750)
  }, [setRenderMetadata])

  const { content, ens, owner, readingTime } = page

  return (
    <div className="layout">
      <AnimatePresence exitBeforeEnter>
        <LayoutGroup>
          {renderMetadata && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="font-bold mb-10 space-x-3 flex items-center"
            >
              <h1 className="text-geo-blue-100">{ens ?? owner}</h1>
              <p>~{readingTime}m read</p>
            </motion.div>
          )}
          <motion.div layout="position">
            <ReadOnlyEditor content={content ?? ''} />
          </motion.div>
          {/* <motion.div style={{ opacity: 0.4 }}>
            <p>Source: ipfs://{cid}</p>
            <p>
              Contract: {getContractAddress(chain.polygonMumbai, 'GeoDocument')}
            </p>
            <p>Token ID: {tokenId}</p>
          </motion.div> */}
        </LayoutGroup>
      </AnimatePresence>
    </div>
  )
}

export default function PageComponent({ data, error }: ServerProps) {
  if (error) {
    return (
      <code style={{ lineBreak: 'anywhere', fontSize: 12 }}>
        {error.message}
      </code>
    )
  }

  if (!data) return null

  if (!data.item.page) {
    return (
      <div className="layout">
        <div style={{ display: 'flex' }}>
          <NFTImage
            maxWidth={400}
            minWidth={200}
            metadata={data.item.innerMetadata}
          />
          <div style={{ flexBasis: 40 }} />
          <NFTMetadataList metadata={data.item.innerMetadata} />
        </div>
      </div>
    )
  }

  return <GeoDocumentPage page={data.item.page} />
}

interface ServerProps {
  data?: {
    item: GeodeItem
  }
  error?: { message: string }
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: geodeId } = context.query
  const host = context.req.headers.host!

  try {
    return {
      props: {
        data: {
          item: await fetchGeodeItem(host, geodeId as string),
        },
      },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
