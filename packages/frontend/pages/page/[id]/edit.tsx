import { motion } from 'framer-motion'
import { GetServerSideProps } from 'next'
import { useAccount } from 'wagmi'
import { fetchGeodeItem, GeodeItem } from '~/modules/api/geode-item'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function Edit(props: ServerProps) {
  const { isConnected } = useAccount()
  const publishService = usePublishService()

  if ('error' in props) {
    return <div>{props.error.message}</div>
  }

  const { item } = props.data

  if (!isConnected) {
    return (
      <div className="layout">
        <h1 className="text-lg font-medium">
          Sign in to your wallet to start publishing content in Geo
        </h1>
      </div>
    )
  }

  if (!item.page) return <div>Can only edit pages</div>

  return (
    <motion.div className="layout" layout="position">
      <Editor
        publishService={publishService}
        initialContent={item.page.content}
      />
    </motion.div>
  )
}

type ServerProps =
  | {
      data: {
        item: GeodeItem
      }
    }
  | {
      error: { message: string }
    }

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query
  const host = context.req.headers.host!

  try {
    const item = await fetchGeodeItem(host, tokenID as string)

    return { props: { data: { item } } }
  } catch (e) {
    return { props: { error: { message: (e as Error).message } } }
  }
}
