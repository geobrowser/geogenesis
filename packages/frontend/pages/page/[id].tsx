import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { chain } from 'wagmi'
import { getEnsName } from '~/modules/api/ens'
import { usePublishService } from '~/modules/api/publish-service'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenOwner, fetchTokenParameters } from '~/modules/api/token'
import { ReadOnlyEditor } from '~/modules/editor/editor'

export default function Token({ data, error }: ServerProps) {
  const content = data ? data.content : undefined
  const owner = data ? data.owner : undefined
  const readingTime = data ? data.readingTime : undefined
  const publishService = usePublishService()
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

  return (
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
      </LayoutGroup>
    </AnimatePresence>
  )
}

interface ServerProps {
  data?: { content: string; owner: string; readingTime: number }
  error?: { message: string }
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query

  try {
    const [{ cid }, { owner }] = await Promise.all([
      fetchTokenParameters(chain.polygonMumbai, tokenID as string),
      fetchTokenOwner(chain.polygonMumbai, tokenID as string),
    ])

    const [maybeEns, content] = await Promise.all([
      getEnsName(owner),
      getStorageClient().downloadText(cid),
    ])

    context.res.setHeader('Cache-Control', 'maxage=86400')
    const readingTime = Math.ceil(content.split(' ').length / 250) // minutes

    return {
      props: { data: { content, owner: maybeEns ?? owner, readingTime } },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
