import { NFTStorage, toGatewayURL } from 'nft.storage'

export type StorageClient = ReturnType<typeof getStorageClient>

export function getStorageClient() {
  const client = new NFTStorage({
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDI4N2M0MDI1MjU2RjZkMzRmREIzYzAyMGREQWZBRDg2NDgxN2RjZGEiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTY1OTU1ODg0ODkyNywibmFtZSI6Ikdlb0RvY3VtZW50In0.iXYqLZqSV8Hjr-M_-94xLokbQrmSgFAVcEqkszhf76E',
  })

  async function upload(content: string) {
    const blob = new Blob([content], { type: 'text/plain' })

    const cid = await client.storeBlob(blob)

    return cid
  }

  async function getGatewayURL(cid: string) {
    return toGatewayURL(`ipfs://${cid}`)
  }

  async function downloadText(cid: string) {
    const url = await getGatewayURL(cid)
    const response = await fetch(url)
    const text = await response.text()
    return text
  }

  return { upload, getGatewayURL, downloadText }
}
