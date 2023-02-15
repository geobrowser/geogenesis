export const IMAGE_ATTRIBUTE = '457a27af-7b0b-485c-ac07-aa37756adafa'
export const DESCRIPTION = 'Description'
export const NAME = 'name'
export const SPACE = 'space'
export const ATTRIBUTE = 'attribute'

/* 
  Example Usage: Rhonda Patrick -> TYPES -> Person 
  Note that we should probably convert "type" to "types" or a UUID in the future.
  */
export const TYPES = 'type'

/* Example Usage: Person -> ATTRIBUTES -> Age */
export const ATTRIBUTES = '01412f83-8189-4ab1-8365-65c7fd358cc1'

/* Example Usage: Person -> TYPES -> SCHEMA_TYPE */
export const SCHEMA_TYPE = 'd7ab4092-0ab5-441e-88c3-5c27952de773'

export const VALUE_TYPE = 'ee26ef23-f7f1-4eb6-b742-3b0fa38c1fd8'

/* Example Usage: City -> VALUE_TYPE -> RELATION */
export const RELATION = '14611456-b466-4cab-920d-2245f59ce828'

/* Example Usage: Address -> VALUE_TYPE -> TEXT */
export const TEXT = '9edb6fcc-e454-4aa5-8611-39d7f024c010'

/* Note that this is a temporary workaround for production MVP release. As such, this system ID isn't included in the bootstrap process.*/
export const DEFAULT_TYPE = 'aeebbd5e-4d79-4d24-ae99-239e9142d9ed'

/** 
  There are currently multiple beacon proxies representing multiple space deployments on Polygon mainnet.
  Going forward we need to make sure all new permissionless spaces are deployed using a single Beacon
  rather than creating a new beacon.

  See packages/contracts/.openzepplin/polygon.json for metadata on the deployed contracts.
*/
export const BEACONS = [
  {
    // This is the original beacon proxy deployed for the first spaces.
    address: '0x8991A5056A0ebC8740A9F74Fd9122dAdE2F29ED0',
    txHash:
      '0x3b7e16025ef0ceb218dc244a2145ea6dc153185cea175dc7a01ef09d0e214aea',
    kind: 'beacon',
  },
  {
    address: '0x9C65Ff69c55B2Af83d1E396188Ec05f2101F4b7E',
    txHash:
      '0x91e258c315a7d4e8cebbe51ca1dcd7c973a8700698e7bf7f16ecb44c15dc47bc',
    kind: 'beacon',
  },
  {
    address: '0x9952B5C325981fa48Df48BfCCdb019161E9e56D3',
    txHash:
      '0xfafedd87721f08c559dd0c7fc80c73b4a61756650a3dee504c89160a11045e69',
    kind: 'beacon',
  },
]

export const ROOT_SPACE_REGISTRY = '0x170b749413328ac9a94762031a7A05b00c1D2e34'
