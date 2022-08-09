import { motion } from 'framer-motion'
import { GetServerSideProps } from 'next'
import { chain, useAccount } from 'wagmi'
import { fetchPage, Page } from '~/modules/api/page'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function Edit(props: ServerProps) {
  const { isConnected } = useAccount()
  const publishService = usePublishService()

  if ('error' in props) {
    return <div>{props.error.message}</div>
  }

  const { page } = props.data

  if (!isConnected) {
    return (
      <div className="layout">
        <h1 className="text-lg font-medium">
          Sign in to your wallet to start publishing content in Geo
        </h1>
      </div>
    )
  }

  return (
    <motion.div className="layout" layout="position">
      <Editor publishService={publishService} initialContent={page.content} />
    </motion.div>
  )
}

type ServerProps =
  | {
      data: {
        page: Page
      }
    }
  | {
      error: { message: string }
    }

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query

  try {
    const page = await fetchPage(chain.polygonMumbai, tokenID as string)

    return { props: { data: { page } } }
  } catch (e) {
    return { props: { error: { message: (e as Error).message } } }
  }
}
