import { GetServerSideProps } from 'next'
import { NFTMetadata } from '~/modules/api/nft'
import { NFTCard } from '~/modules/ui/nft-card'

interface ServerProps {
  metadata?: NFTMetadata
  contractAddress: string
  error?: { message: string }
}

export default function NFT(props: ServerProps) {
  const metadata = props.metadata!

  if (props.error) {
    return <div>{props.error.message}</div>
  }

  return <NFTCard metadata={metadata} />
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const id = context.query.id as string
  const contractAddress = context.query.contractAddress as string

  const host = context.req.headers.host
  const url = `http://${host}/api/nft/${contractAddress}/${id}`

  try {
    const [metadata] = await Promise.all([(await fetch(url)).json()])

    return {
      props: { metadata, url, contractAddress },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message }, url, contractAddress },
    }
  }
}
