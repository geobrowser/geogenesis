export const IMAGE_ATTRIBUTE = '457a27af-7b0b-485c-ac07-aa37756adafa'
export const DESCRIPTION = 'Description'
export const NAME = 'name'
export const SPACE = 'space'
export const INDEXED_SPACE = '30659852-2df5-42f6-9ad7-2921c33ad84b'
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

// Date of Birth -> VALUE_TYPE -> DATE
export const DATE = '167664f6-68f8-40e1-976b-20bd16ed8d47'

// Twitter -> VALUE_TYPE -> WEB_URL
export const WEB_URL = 'dfc221d9-8cce-4f0b-9353-e437a98387e3'

// This sets the type of values which can be set as part of a relation value.
// e.g. An attribute called People can only accept values of type Person
export const RELATION_VALUE_RELATIONSHIP_TYPE =
  'cfa6a2f5-151f-43bf-a684-f7f0228f63ff'

/* Note that this is a temporary workaround for production MVP release. As such, this system ID isn't included in the bootstrap process.*/
export const DEFAULT_TYPE = 'aeebbd5e-4d79-4d24-ae99-239e9142d9ed'

export const PERSON_TYPE = 'af7ae93b-97d6-4aed-ad69-0c1d3da149a1'
export const NONPROFIT_TYPE = 'b3b03c90-9b6d-487c-b2e2-a7d685f120eb'
export const PROJECT_TYPE = 'cb9d261d-456b-4eaf-87e5-1e9faa441867'
export const REGION_TYPE = '911a8e0a-52f2-4655-a0c6-d89cd161bb12'
export const NONPROFIT_SERVICE_TYPE = '2edf4225-7937-41ba-b205-6ac91ab4aab4'
export const TAG_TYPE = '3d31f766-b651-48af-a357-271343a773de'
export const TOPIC_TYPE = '1d7f027e-415c-4f69-800e-460fde65feb9'
export const GOAL_TYPE = 'f7191246-3dca-4e77-8a79-d9cdc9804127'
export const CLAIM_TYPE = 'fa8e8e54-f742-4c00-b73c-05adee2b4545'
export const COMPANY_TYPE = '9cc8a65d-df92-4c0c-8d90-24980e822dc0'

export const VALUES_ATTRIBUTE = 'c8e8fd5f-011d-4c8e-8aaf-1a2ffc5b48fd'
export const VISION_ATTRIBUTE = 'c6702478-93c7-4af4-8f2a-285a46cc19ca'
export const MISSION_ATTRIBUTE = '6db5eaa5-1cf6-463e-88f9-87bd631db044'
export const SPEAKERS_ATTRIBUTE = '03597522-e1f2-423b-882d-330cfe89331d'
export const RELEVANT_QUESTIONS_ATTRIBUTE =
  'ee5648a5-d638-4780-9796-cd8605517545'
export const SUPPORTING_ARGUMENTS_ATTRIBUTE =
  'cd598fe8-8dc5-40fb-afc7-27d363aa2b31'
export const BROADER_CLAIMS_ATTRIBUTE = '8db09ed2-1a66-408e-ab8d-8e8f931a09cf'
export const SOURCES_ATTRIBUTE = '5b4e9b74-55f4-4e57-b0b3-58da71188191'
export const QUOTES_ATTRIBUTE = '4ca754c9-a01a-4ef2-a5d6-597c58764529'
export const SUBCLAIMS_ATTRIBUTE = '21d9fa3c-fecf-42bc-8f8e-9fcc6ae2b0cd'
export const OPPOSING_ARGUMENTS_ATTRIBUTE =
  '0c0a2a95-1928-4ec4-876d-cc04075b7927'
export const BROADER_TOPICS_ATTRIBUTE = '9c2ef131-3a15-47e9-ac5d-0fce07e792a1'
export const DEFINITIONS_ATTRIBUTE = '37ae1d79-b26e-4bf5-88cb-69087a992dc9'
export const RELATED_TOPICS_ATTRIBUTE = '0db47aca-1ccf-4c9f-beb6-89519ebe9eed'
export const SUBTOPICS_ATTRIBUTE = '21be6a84-3125-44a2-bb2e-3c23928ce4aa'
export const TAGS_ATTRIBUTE = '90dcfc33-0cdb-4252-a7c3-f653d4f54e26'
export const CLAIMS_FROM_ATTRIBUTE = '7fa816a3-cb70-4534-9348-88449869dc33'
export const SUBGOALS_ATTRIBUTE = '377ac7e8-18ab-443c-bc26-29ff04745f99'
export const BROADER_GOALS_ATTRIBUTE = '2bd0960f-5af9-4b0c-8939-20e9edf31ede'
export const PERSON_ATTRIBUTE = '626e4ad5-61c3-49ae-af5e-3c80e53cf890'
export const TOPICS_ATTRIBUTE = '5742a703-8b73-4eb6-b3df-4378c1b512c6'
export const REGION_ATTRIBUTE = '5e4911b8-2093-411e-a445-bc2124d7f8e3'
export const EMAIL_ATTRIBUTE = 'a89fcd10-81b3-43e4-8f77-0d9561a68acd'
export const STREET_ADDRESS_ATTRIBUTE = 'c4b9a30a-92a9-4574-8f9b-31c41eb8bbd8'
export const PHONE_NUMBER_ATTRIBUTE = 'cb361409-4695-4676-b62f-c2290613a430'
export const NONPROFIT_ID_NUMBER_ATTRIBUTE =
  'dcb87494-cb91-447b-9a04-625bd1acc804'
export const GOALS_ATTRIBUTE = 'f9804f7c-0e2e-4658-a848-9aa65bbe411b'
export const NONPROFIT_CATEGORIES_ATTRIBUTE =
  'fca2a465-6426-40bb-8e7e-cf33742b5346'
export const WEB_URL_ATTRIBUTE = 'e8010874-d330-4a4d-9907-62e89a19371a'
export const AVATAR_ATTRIBUTE = '235ba0e8-dc7e-4bdd-a1e1-6d0d4497f133'
export const COVER_ATTRIBUTE = '34f53507-2e6b-42c5-a844-43981a77cfa2'
export const ROLE_ATTRIBUTE = '9c1922f1-d7a2-47d1-841d-234cb2f56991'

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

export const WALLETS_ATTRIBUTE = '31f6922e-0d4e-4f14-a1ee-8c7689457715'

export const PEOPLE_SPACE = '0xb4476A42A66eC1356A58D300555169E17db6756c'

export const BROADER_SPACES = '03aa11ed-d69a-4d5e-a0ae-a0f197614cfd'

/**
 * Addresses for important contracts on Polygon mainnet.
 *
 * Note: If you want to test deployments on a different network (e.g. local or Mumbai),
 * you can update these addresses to point to the correct contracts on that network.
 */

export const PROFILE_REGISTRY_ADDRESS =
  '0xc066E89bF7669b905f869Cb936818b0fd0bc456d'
// '0x62b5b813B74C4166DA4f3f88Af6E8E4e657a9458' // mumbai

// This represents the beacon for the first set of deployed permissioned spaces.
// We should use this beacon for all new permissioned spaces. We need to track the beacon
// address in case we decide to upgrade the implementation of the permissionless space.
export const PERMISSIONED_SPACE_BEACON_ADDRESS =
  '0xe44Be15e413169Ad49fB24CBF8db192BE5A9A8bF'
// '0xf7239cb6d1ac800f2025a2571ce32bde190059cb' // mumbai

// This represents the Space contract acting as the registry for all permissioned spaces.
// This is the address for the Root Space.
export const PERMISSIONED_SPACE_REGISTRY_ADDRESS =
  '0x170b749413328ac9a94762031a7A05b00c1D2e34'

// This represents the beacon for all permissionless spaces. We need to track the beacon
// address in case we decide to upgrade the implementation of the permissionless space.
export const PERMISSIONLESS_SPACE_BEACON_ADDRESS =
  '0xf14C33B732851ECccA5e2c84a9b0DB6Eb24a5a4A'
// '0xc90513962Db42C1fb44fBb97a8eb0c2E102701Da' // mumbai

// This represents the PermissionlessSpace contract acting as the registry for all
// permissionless spaces.
export const PERMISSIONLESS_SPACE_REGISTRY_ADDRESS =
  '0x68930a23A91A8FA97C6053cD5057431BaD3eEB52'
// '0x42096035524630382E73cfFAE1CA319CFa72F4dC' // mumbai

export const MEMBERSHIP_CONTRACT_ADDRESS =
  '0x34a94160f4B0f86d932927DFfb326354dB279181'
// '0x22e4484e71ec9ea3b115aa21fd3d9f98edbe5d4e' // mumbai

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
