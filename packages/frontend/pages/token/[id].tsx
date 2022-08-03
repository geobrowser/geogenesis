import { GetServerSideProps } from 'next'
import { chain } from 'wagmi'
import { contentService } from '~/modules/editor/content'
import { Editor } from '~/modules/editor/editor'
import { fetchTokenURI } from '~/modules/utils/tokenAPI'

export default function Token({ tokenURI, errorMessage }: ServerProps) {
  const content = `# Title

Hello, world!`

  return (
    <>
      <code style={{ lineBreak: 'anywhere', fontSize: 12 }}>
        {tokenURI || errorMessage}
      </code>
      <Editor
        contentService={contentService}
        initialContent={content}
        editable={false}
      />
    </>
  )
}

interface ServerProps {
  tokenURI?: string
  errorMessage?: string
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id: tokenID } = context.query

  try {
    const tokenURI = await fetchTokenURI(chain.polygonMumbai, tokenID as string)

    return {
      props: { tokenURI },
    }
  } catch (e) {
    return {
      props: {
        errorMessage: (e as Error).message,
      },
    }
  }
}
