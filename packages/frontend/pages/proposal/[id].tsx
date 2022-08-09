import { GetServerSideProps } from 'next'
import { chain, useNetwork, useSigner } from 'wagmi'
import { fetchGeodeContent } from '~/modules/api/geode'
import { fetchProposalParameters, mergeProposal } from '~/modules/api/proposal'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { ReadOnlyEditor } from '~/modules/editor/editor'
import { getContractAddress } from '~/modules/utils/getContractAddress'

interface ServerProps {
  data?: {
    proposalId: string
    proposedContent: string
    targetContent: string
  }
  error?: { message: string }
}

export default function Proposal({ error, data }: ServerProps) {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  if (error) {
    return <div>{error.message}</div>
  }

  const { proposedContent, targetContent, proposalId } = data!

  return (
    <div>
      <div className="proposal flex space-x-10">
        <div className="proposal-editor">
          <h2 className="text-geo-grey-56 py-5 border-y border-geo-grey-8 mb-10">
            Current live version
          </h2>
          <ReadOnlyEditor content={targetContent} />
        </div>

        <div className="h-auto w-px border-r border-geo-grey-8" />

        <div className="proposal-editor">
          <h2 className="text-geo-grey-56 py-5 border-y border-geo-grey-8 mb-10">
            Your version
          </h2>
          <ReadOnlyEditor content={proposedContent} />
        </div>
      </div>
      {signer && chain && (
        <button
          onClick={() => {
            mergeProposal(signer, chain, proposalId)
          }}
        >
          Merge
        </button>
      )}
    </div>
  )
}

// Fetch text for before and after
export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  context
) => {
  const proposalId = context.query.id as string
  const contractAddress = getContractAddress(chain.polygonMumbai, 'Proposal')!

  const host = context.req.headers.host
  const url = `http://${host}/api/nft/${contractAddress}/${proposalId}`

  try {
    const parameters = await fetchProposalParameters(proposalId)
    const geodeContent = await fetchGeodeContent(parameters.target.tokenId)

    // We fetch token parameters individually since there's some strange caching/duplication
    // bug when doing Promise.all. Might be ethers.actor or something else we can't figure out.
    const { cid: proposedCID } = await fetchTokenParameters(
      chain.polygonMumbai,
      parameters.proposed.tokenId as string
    )

    const { cid: targetCID } = await fetchTokenParameters(
      chain.polygonMumbai,
      geodeContent.tokenId as string
    )

    const [targetContent, proposedContent] = await Promise.all([
      getStorageClient().downloadText(targetCID),
      getStorageClient().downloadText(proposedCID),
    ])

    return {
      props: {
        data: {
          proposalId,
          targetContent, // markdown for the live version
          proposedContent, // markdown for proposed version
        },
      },
    }
  } catch (e) {
    return {
      props: { error: { message: (e as Error).message }, url },
    }
  }
}
