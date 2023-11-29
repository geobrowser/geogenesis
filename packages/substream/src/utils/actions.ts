import { DESCRIPTION, NAME, TYPES } from '../constants/system-ids.js'
import { ZodAction, type Action, type UriData } from '../zod.js'
import { ipfsFetch } from './ipfs.js'

export async function fetchIpfsContent(uri: string): Promise<UriData | null> {
  if (uri.startsWith('data:application/json;base64,')) {
    const base64 = uri.split(',')[1]! // we can cast with bang because we know a base64 string will always have a second element
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    return decoded
  }

  if (uri.startsWith('ipfs://')) {
    const fetched = await ipfsFetch(uri)
    return fetched
  }

  return null
}

export function isValidAction(action: Action): action is Action {
  return ZodAction.safeParse(action).success
}

type ActionTypes = {
  isNameCreateAction: boolean
  isNameDeleteAction: boolean
  isDescriptionCreateAction: boolean
  isDescriptionDeleteAction: boolean
  isTypeTriple: boolean
}

export function getActionTypes(action: Action): ActionTypes {
  const isCreateTriple = action.type === 'createTriple'
  const isDeleteTriple = action.type === 'deleteTriple'
  const isNameAttribute = action.attributeId === NAME
  const isDescriptionAttribute = action.attributeId === DESCRIPTION
  const isStringValueType = action.value.type === 'string'
  const isTypeTriple =
    action.attributeId === TYPES && action.value.type === 'entity'

  return {
    isNameCreateAction: isCreateTriple && isNameAttribute && isStringValueType,
    isNameDeleteAction: isDeleteTriple && isNameAttribute && isStringValueType,
    isDescriptionCreateAction:
      isCreateTriple && isDescriptionAttribute && isStringValueType,
    isDescriptionDeleteAction:
      isDeleteTriple && isDescriptionAttribute && isStringValueType,
    isTypeTriple,
  }
}
