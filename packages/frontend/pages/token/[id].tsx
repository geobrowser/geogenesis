import { useEffect, useState } from 'react'
import { GetServerSideProps } from 'next'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { chain } from 'wagmi'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function Token({ data, error }: ServerProps) {
  const content = data ? data.content : undefined
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
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="font-bold text-geo-blue-100 mb-10"
          >
            thegreenalien.eth
          </motion.h1>
        )}
        <motion.div layout>
          <Editor
            publishService={publishService}
            initialContent={content}
            editable={false}
          />
        </motion.div>
      </LayoutGroup>
    </AnimatePresence>
  )
}

interface ServerProps {
  data?: { content: string }
  error?: { message: string }
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query

  try {
    const { contentHash } = await fetchTokenParameters(
      chain.polygonMumbai,
      tokenID as string
    )

    const content = await getStorageClient().downloadText(contentHash)

    context.res.setHeader('Cache-Control', 'maxage=86400')

    return {
      props: { data: { content } },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
