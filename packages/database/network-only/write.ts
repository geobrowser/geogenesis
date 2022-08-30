// import { IGeoContract, IGeoIpfsClient } from '../ipld'
import { MOCK_FACTS, ResolvedFact } from './database'

export async function writeFact(
  // ignoring ipfs and contract for now
  // ipfs: IGeoIpfsClient,
  // contract: IGeoContract,
  fact: ResolvedFact
) {
  MOCK_FACTS.push(fact)
  return fact
}
