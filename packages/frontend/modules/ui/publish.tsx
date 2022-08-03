import TurndownService from 'turndown'
// This can come through context or something dependency injected as well
import { addresses, GeoDocument__factory } from '@geogenesis/contracts'
import { ContractTransaction, Event } from 'ethers'
import { useNetwork, useSigner } from 'wagmi'
import { contentService } from '~/modules/editor/content'

const turndown = new TurndownService({
  // Just using some default rules for now. They _should_ be defaulted internally, but it's
  // not working for some reason. We get a runtime error.
  headingStyle: 'setext',
  hr: '* * *',
  bulletListMarker: '*',
  codeBlockStyle: 'indented',
  fence: '```',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  br: '  ',
})

function isSupportedChain(chainId: string): chainId is keyof typeof addresses {
  return chainId in addresses
}

async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}

export function PublishButton() {
  const { chain } = useNetwork()
  const { data: signer } = useSigner()

  const onPublish = async () => {
    console.log(turndown.turndown(contentService.content))

    if (!signer || !chain) return

    const chainId = String(chain.id)

    if (!isSupportedChain(chainId)) return

    const contractAddress = addresses[chainId].GeoDocument.address

    const contract = GeoDocument__factory.connect(contractAddress, signer)

    console.log('Minting...')

    const mintTx = await contract.mint({
      contentHash:
        'bafkreibrl5n5w5wqpdcdxcwaazheualemevr7ttxzbutiw74stdvrfhn2m',
      nextVersionId: 0,
      previousVersionId: 0,
    })

    const transferEvent = await findEvent(mintTx, 'Transfer')

    if (transferEvent.args) {
      console.log(`Successfully minted token ${transferEvent.args.tokenId}`)
    }
  }

  return (
    <button
      className="rounded-2xl px-6 py-4 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      Publish
    </button>
  )
}
