import { useRouter } from 'next/router'
import { FormEvent, useState } from 'react'
import { chain as chainOptions, useNetwork, useSigner } from 'wagmi'
import { createGeode } from '~/modules/api/geode'
import { getContractAddress } from '~/modules/utils/getContractAddress'

export default function New() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  const [contractAddress, setContractAddress] = useState<string>(
    chain ? getContractAddress(chain, 'Geode') ?? '' : ''
  )
  const [tokenId, setTokenId] = useState('')

  const router = useRouter()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!signer || !chain) return

    if (!contractAddress.startsWith('0x')) {
      throw new Error('Contract address must start with 0x')
    }

    if (!Number.isInteger(Number(tokenId))) {
      throw new Error('Token id must be integer')
    }

    const id = await createGeode(signer, chain, {
      contractAddress,
      tokenId: tokenId,
    })

    router.push(
      `/nft/${getContractAddress(chainOptions.polygonMumbai, 'Geode')}/${id}`
    )
  }

  return (
    <div>
      <h1 className="text-geo-largeTitle">Create Geode</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="contract-address-input">Contract Address:</label>
          <input
            id="contract-address-input"
            type="text"
            placeholder="0x..."
            value={contractAddress}
            onChange={(event) => {
              setContractAddress(event.target.value)
            }}
          />
        </div>
        <div>
          <label htmlFor="token-id">Token ID:</label>
          <input
            id="token-id"
            type="text"
            placeholder="42"
            value={tokenId}
            onChange={(event) => {
              setTokenId(event.target.value)
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
