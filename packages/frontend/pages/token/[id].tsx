import { GetServerSideProps } from 'next'
import { chain } from 'wagmi'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function Token({ data, error }: ServerProps) {
  const content = data ? data.content : undefined
  const publishService = usePublishService()

  if (error) {
    return (
      <code style={{ lineBreak: 'anywhere', fontSize: 12 }}>
        {error.message}
      </code>
    )
  }

  return (
    <Editor
      publishService={publishService}
      initialContent={content}
      editable={false}
    />
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

    return {
      props: { data: { content } },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message } },
    }
  }
}
