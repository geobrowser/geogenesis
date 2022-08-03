import { GetServerSideProps } from 'next'
import { chain } from 'wagmi'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { contentService } from '~/modules/editor/content'
import { Editor } from '~/modules/editor/editor'

export default function Token({ data, error }: ServerProps) {
  const content = data ? data.content : undefined

  if (error) {
    return (
      <code style={{ lineBreak: 'anywhere', fontSize: 12 }}>
        {error.message}
      </code>
    )
  }

  return (
    <Editor
      contentService={contentService}
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
