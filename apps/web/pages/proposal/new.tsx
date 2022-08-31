import { useRouter } from 'next/router'
import { FormEvent, useState } from 'react'
import { useNetwork, useSigner } from 'wagmi'
import { createProposal } from '~/modules/api/proposal'
import { getContractAddress } from '~/modules/utils/getContractAddress'

export default function New() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  const [geodeId, setGeodeId] = useState('')
  const [proposedContractAddress, setProposedContractAddress] =
    useState<string>(
      chain ? getContractAddress(chain, 'GeoDocument') ?? '' : ''
    )
  const [proposedTokenId, setProposedTokenId] = useState('')

  const router = useRouter()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!signer || !chain) return

    if (!proposedContractAddress.startsWith('0x')) {
      throw new Error('Contract address must start with 0x')
    }

    if (!Number.isInteger(Number(geodeId))) {
      throw new Error('Geode id must be integer')
    }

    if (!Number.isInteger(Number(proposedTokenId))) {
      throw new Error('Proposed token id must be integer')
    }

    const target = {
      contractAddress: getContractAddress(chain, 'Geode')!,
      tokenId: geodeId,
    }

    const proposed = {
      contractAddress: proposedContractAddress,
      tokenId: proposedTokenId,
    }

    console.log('propose updating', target, 'to contain', proposed)

    const id = await createProposal(signer, chain, { target, proposed })

    router.push(`/proposal/${id}`)
  }

  return (
    <div className="layout">
      <h1 className="text-geo-largeTitle">Create Proposal</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="geode-id">Geode ID:</label>
          <input
            id="geode-id"
            type="text"
            placeholder="42"
            value={geodeId}
            onChange={(event) => {
              setGeodeId(event.target.value)
            }}
          />
        </div>
        <div>
          <label htmlFor="contract-address-input">
            Proposed Contract Address:
          </label>
          <input
            id="contract-address-input"
            type="text"
            placeholder="0x..."
            value={proposedContractAddress}
            onChange={(event) => {
              setProposedContractAddress(event.target.value)
            }}
          />
        </div>
        <div>
          <label htmlFor="token-id">Proposed Token ID:</label>
          <input
            id="token-id"
            type="text"
            placeholder="42"
            value={proposedTokenId}
            onChange={(event) => {
              setProposedTokenId(event.target.value)
            }}
          />
        </div>
        <button
          className="text-stone-50 bg-geo-blue-100 font-bold rounded-3xl w-36 py-2"
          disabled={!signer || !chain}
        >
          Create
        </button>
      </form>
    </div>
  )
}
