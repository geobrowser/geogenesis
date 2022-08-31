import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { chain } from 'wagmi'
import { fetchPage } from '~/modules/api/page'
import { ReadOnlyEditor } from '~/modules/editor/editor'

export default function Token({ data, error }: ServerProps) {
  const [renderMetadata, setRenderMetadata] = useState(false)

  // In order to do trigger a layout transition on the editor
  // we need to insert the metadata node into the DOM to force
  // the editor position to slide down.
  useEffect(() => {
    setTimeout(() => setRenderMetadata(true), 750)
  }, [setRenderMetadata])

  if (error) {
    return (
      <code style={{ lineBreak: 'anywhere', fontSize: 12 }}>
        {error.message}
      </code>
    )
  }

  if (!data) return null

  const { content, owner, readingTime, cid, tokenId } = data

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
              <h1 className="text-geo-blue-100">{owner}</h1>
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

interface ServerProps {
  data?: {
    content: string
    owner: string
    readingTime: number
    cid: string
    tokenId: string
  }
  error?: { message: string }
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query

  try {
    const page = await fetchPage(chain.polygonMumbai, tokenID as string)

    return {
      props: {
        data: {
          content: page.content,
          owner: page.ens ?? page.owner,
          readingTime: page.readingTime,
          cid: page.cid,
          tokenId: tokenID as string,
        },
      },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
