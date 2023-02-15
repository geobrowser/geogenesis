import { ContractTransaction, Event } from 'ethers'

export async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}
