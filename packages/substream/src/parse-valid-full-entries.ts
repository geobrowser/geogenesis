import { isValidAction } from './utils/actions'
import { ZodUriData, type FullEntry } from './zod'

// Filter out any invalid actions from entries
export function parseValidFullEntries(
  nonValidatedFullEntries: FullEntry[]
): FullEntry[] {
  const fullEntries: FullEntry[] = []

  for (const entry of nonValidatedFullEntries) {
    // Note that ZodUriData has actions as an Array<any>. This is so
    // we don't invalidate the entire data structure for individually
    // incorrect actions. We filter out invalid actions individually
    // later in this function.
    //
    // We don't want to reject the entire data structure and instead
    // parse out the valid actions so we can still partially apply
    // published actions.
    const uriResponse = ZodUriData.safeParse(entry.uriData)

    if (!uriResponse.success) {
      console.error('Failed to parse URI data: ', uriResponse)
      console.error('URI used: ', entry.uri)
      console.error(uriResponse.error)
      continue
    }

    // We filter out individual invalid actions so we can partially
    // apply any published actions.
    const actions = uriResponse.data.actions.filter(isValidAction)

    console.log(
      `Found ${actions.length} valid actions out of ${uriResponse.data.actions.length} total actions`
    )
    fullEntries.push({
      ...entry,
      uriData: { ...uriResponse.data, actions },
    })
  }

  return fullEntries
}
