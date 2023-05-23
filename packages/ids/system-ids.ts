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

// A Type is a categorization of an Entity. For example, a Person Type has specific
// schema associated with it. An Entity can be a Person Type. An Entity can have
// multiple Types. For example, an Entity can be a Person and a Philosopher.
/* Example Usage: Person -> TYPES -> SCHEMA_TYPE */
export const SCHEMA_TYPE = 'd7ab4092-0ab5-441e-88c3-5c27952de773'

export const VALUE_TYPE = 'ee26ef23-f7f1-4eb6-b742-3b0fa38c1fd8'

/* Example Usage: Thumbnail -> VALUE_TYPE -> IMAGE */
export const IMAGE = 'ba4e4146-0010-499d-a0a3-caaa7f579d0e'

/* Example Usage: City -> VALUE_TYPE -> RELATION */
export const RELATION = '14611456-b466-4cab-920d-2245f59ce828'

/* Example Usage: Address -> VALUE_TYPE -> TEXT */
export const TEXT = '9edb6fcc-e454-4aa5-8611-39d7f024c010'

/* Note that this is a temporary workaround for production MVP release. As such, this system ID isn't included in the bootstrap process.*/
export const DEFAULT_TYPE = 'aeebbd5e-4d79-4d24-ae99-239e9142d9ed'

export const PERSON_ATTRIBUTE = '626e4ad5-61c3-49ae-af5e-3c80e53cf890'

export const AVATAR_ATTRIBUTE = '235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133'

export const COVER_ATTRIBUTE = '34f53507-2e6b-42c5-a844-43981a77cfa2'

/* Example Usage: SF_Config -> FOREIGN_TYPES -> Some_Entity */
export const FOREIGN_TYPES = 'be745973-05a9-4cd0-a46d-1c5538270faf'

/* Example Usage: SF Config -> TYPES -> SPACE_CONFIGURATION */
export const SPACE_CONFIGURATION = '1d5d0c2a-db23-466c-a0b0-9abe879df457'

/* Example Usage: Block Entity -> TYPES -> TABLE_BLOCK */
export const TABLE_BLOCK = '88d59252-17ae-4d9a-a367-24710129eb47'

export const SHOWN_COLUMNS = '388ad59b-1cc7-413c-a0bb-34a4de48c758'

/* Example Usage: Block Entity -> TYPES -> TEXT_BLOCK */
export const TEXT_BLOCK = '8426caa1-43d6-47d4-a6f1-00c7c1a9a320'

/* Example Usage: Block Entity -> TYPES -> IMAGE_BLOCK */
export const IMAGE_BLOCK = 'f0553d4d-4838-425e-bcd7-613bd8f475a5'

/* Example Usage: Entity -> BLOCKS -> Some_Entity_Of_Type_TEXT_BLOCK_or_TABLE_BLOCK */
export const BLOCKS = 'beaba5cb-a677-41a8-b353-77030613fc70'

/* Example Usage: Block Entity -> PARENT_ENTITY -> Some_Entity_ID */
export const PARENT_ENTITY = 'dd4999b9-77f0-4c2b-a02b-5a26b233854e'

/* Example Usage:
Block Entity -> TYPES -> TEXT_BLOCK
Block Entity -> MARKDOWN_CONTENT -> "**hello world!**" */
export const MARKDOWN_CONTENT = 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4'

/* Example Usage:
Block Entity -> TYPES -> TABLE_BLOCK
Block Entity -> ROW_TYPE -> Some_Type_ID */
export const ROW_TYPE = '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac'

export const FILTER = 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103'

// Right now there is no way to remove Spaces from the Space Registry and Subgraph store.
// Temporarily we just filter The Graph space when we fetch Spaces.
export const THE_GRAPH_SPACE = '0x1b7a66284C31A8D11a790ec79916c425Ef6E7886'

/**
 * Addresses for important contracts on Polygon mainnet.
 *
 * Note: If you want to test deployments on a different network (e.g. local or Mumbai),
 * you can update these addresses to point to the correct contracts on that network.
 */

// This represents the beacon proxy for the first set of deployed permissioned spaces.
// We should use this beacon proxy for all new permissioned spaces.
export const PERMISSIONED_SPACE_BEACON_ADDRESS =
  '0xe44Be15e413169Ad49fB24CBF8db192BE5A9A8bF'

// This represents the Space contract acting as the registry for all permissioned spaces.
// This is the address for the Root Space.
export const PERMISSIONED_SPACE_REGISTRY_ADDRESS =
  '0x170b749413328ac9a94762031a7A05b00c1D2e34'

// This represents the beacon proxy for all permissionless spaces.
export const PERMISSIONLESS_SPACE_BEACON_ADDRESS = ''

// This represents the PermissionlessSpace contract acting as the registry for all
// permissionless spaces.
export const PERMISSIONLESS_SPACE_REGISTRY_ADDRESS = ''

/**
  There are currently multiple beacon proxies representing multiple space deployments on Polygon mainnet.
  Going forward we need to make sure all new permissionless and permissioned spaces are deployed using
  a single Beacon for each type rather than creating a new beacon every time we deploy new spaces.

  See packages/contracts/.openzepplin/polygon.json for metadata on the deployed beacons.

  Note: This is commented out for now to make the subgraph happy since it depends on this file.

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
*/

// Legacy attributes
export const HIDDEN_COLUMNS = '1ed5b976-f8a4-451b-a2cc-531f85b59cab'
