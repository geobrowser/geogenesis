import { GetServerSideProps } from 'next'
import { chain } from 'wagmi'
import { BoxParameters, fetchGeodeTarget } from '~/modules/api/geode'
import {
  fetchProposalParameters,
  ProposalParameters,
} from '~/modules/api/proposal'
import { getContractAddress } from '~/modules/utils/getContractAddress'

interface ServerProps {
  data?: {
    parameters: ProposalParameters
    geodeTarget: BoxParameters
  }
  error?: { message: string }
}

export default function Proposal({ error, data }: ServerProps) {
  if (error) {
    return <div>{error.message}</div>
  }

  const { parameters, geodeTarget } = data!

  const geodePath = `${parameters.target.contractAddress}/${parameters.target.tokenId}`
  const currentPath = `${geodeTarget.contractAddress}/${geodeTarget.tokenId}`
  const proposedPath = `${parameters.proposed.contractAddress}/${parameters.proposed.tokenId}`

  return (
    <div>
      <div>Propose changing Geode {geodePath}</div>
      <div>
        Current content: {currentPath}
        <iframe
          style={{ width: 550, height: 550 }}
          src={`/nft/${currentPath}`}
        ></iframe>
      </div>
      <div>
        Proposed content: {proposedPath}
        <iframe
          style={{ width: 550, height: 550 }}
          src={`/nft/${proposedPath}`}
        ></iframe>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const id = context.query.id as string
  const contractAddress = getContractAddress(chain.polygonMumbai, 'Proposal')!

  const host = context.req.headers.host
  const url = `http://${host}/api/nft/${contractAddress}/${id}`

  try {
    const parameters = await fetchProposalParameters(id)
    const geodeTarget = await fetchGeodeTarget(parameters.target.tokenId)

    return {
      props: {
        data: {
          parameters,
          geodeTarget,
        },
      },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message }, url },
    }
  }
}
