import { GetServerSideProps } from 'next'
import { NFTMetadata } from '~/modules/api/nft'
import { NFTCard } from '~/modules/ui/nft-card'

interface ServerProps {
  metadata?: NFTMetadata
  error?: { message: string }
}

export default function NFT(props: ServerProps) {
  if (props.error) {
    return <div>{props.error.message}</div>
  }

  const metadata = props.metadata!

  return <NFTCard metadata={metadata} />
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const { id, contractAddress } = context.query

  const host = context.req.headers.host
  const url = `http://${host}/api/nft/${contractAddress}/${id}`

  try {
    const [metadata] = await Promise.all([(await fetch(url)).json()])

    return {
      props: { metadata, url },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message }, url },
    }
  }
}
