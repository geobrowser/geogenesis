import { IGeoContract, IGeoIpfsClient } from '../ipld'

export function writeToIpfs(ipfs: IGeoIpfsClient) {
  return ipfs.store()
}

export function writeToContract(contract: IGeoContract) {
  return contract.create()
}
