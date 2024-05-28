export const IMAGE_ATTRIBUTE = '457a27af7b0b485cac07aa37756adafa';
export const DESCRIPTION = '9b1f76ff9711404c861e59dc3fa7d037';
export const NAME = 'a126ca530c8e48d5b88882c734c38935';
export const SPACE = '362c1dbddc6444bba3c4652f38a642d7';
export const INDEXED_SPACE = '306598522df542f69ad72921c33ad84b';
export const ATTRIBUTE = '808a04ceb21c4d888ad12e240613e5ca';

/**
 * Collections are a data model that enable us to create references between some
 * arbitrary id and a set of entity ids.
 *
 * They act similarly to Join Tables in a relational database, but are designed
 * around the graphbased nature of the Geo data model.
 *
 * A collection is primarily just an id. These can exist as a value in a triple or
 * as an Entire entity. Collection items create a reference between a collection and
 * an entity.
 *
 * ┌─────────────────────┐       ┌────────────────────┐      ┌──────────────────────┐
 * │                     │       │                    │      │                      │
 * │      Collection     │◄──────┤   Collection Item  │─────►│        Entity        │
 * │                     │       │                    │      │                      │
 * └─────────────────────┘       └────────────────────┘      └──────────────────────┘
 */

/**
 * Collection entity type. This is used when the Collection itself is an entity
 * vs. being a value in a Triple
 */
export const COLLECTION_TYPE = 'c373a33052df47b3a6d2df552bda4b44';

/**
 * Collection item type. This is the entity representing the Join between the
 * the Collection and the Entity
 */
export const COLLECTION_ITEM_TYPE = 'c167ef23fb2a40449ed945123ce7d2a9';

/**
 * Collection item's collection reference. This is the attribute that references
 * the Collection id
 */
export const COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE = 'c43b537bcff742718822717fdf2c9c01';

/**
 * Collection item's entity reference. This is the attribute that references
 * the Entity id for a given Collection item entry
 */
export const COLLECTION_ITEM_ENTITY_REFERENCE = 'c1f4cb6fece44c3ca447ab005b756972';

/**
 * Collection item's ordering within the collection. Collections are unordered by
 * default, but we set all collection items to a default index value of 0.
 */
export const COLLECTION_ITEM_INDEX = 'ede47e6930b044998ea4aafbda449609';

/*
  Example Usage: Rhonda Patrick > TYPES > Person
  Note that we should probably convert "type" to "types" or a UUID in the future.
  */
export const TYPES = '8f151ba4de204e3c9cb499ddf96f48f1';

/* Example Usage: Person > ATTRIBUTES > Age */
export const ATTRIBUTES = '01412f8381894ab1836565c7fd358cc1';

// A Type is a categorization of an Entity. For example, a Person Type has specific
// schema associated with it. An Entity can be a Person Type. An Entity can have
// multiple Types. For example, an Entity can be a Person and a Philosopher.
/* Example Usage: Person > TYPES > SCHEMA_TYPE */
export const SCHEMA_TYPE = 'd7ab40920ab5441e88c35c27952de773';

export const VALUE_TYPE = 'ee26ef23f7f14eb6b7423b0fa38c1fd8';

/* Example Usage: Thumbnail > VALUE_TYPE > IMAGE */
export const IMAGE = 'ba4e41460010499da0a3caaa7f579d0e';

/* Example Usage: City > VALUE_TYPE > RELATION */
export const RELATION = '14611456b4664cab920d2245f59ce828';

/* Example Usage: Address > VALUE_TYPE > TEXT */
export const TEXT = '9edb6fcce4544aa5861139d7f024c010';

// Date of Birth > VALUE_TYPE > DATE
export const DATE = '167664f668f840e1976b20bd16ed8d47';

// Twitter > VALUE_TYPE > WEB_URL
export const WEB_URL = 'dfc221d98cce4f0b9353e437a98387e3';

// This sets the type of values which can be set as part of a relation value.
// e.g. An attribute called People can only accept values of type Person
export const RELATION_VALUE_RELATIONSHIP_TYPE = 'cfa6a2f5151f43bfa684f7f0228f63ff';

export const IMAGE_COMPOUND_TYPE = 'ba4e41460010499da0a3caaa7f579d10'
export const IMAGE_COMPOUND_TYPE_SOURCE_ATTRIBUTE = 'ba4e41460010499da0a3caaa7f579d05'

/* Note that this is a temporary workaround for production MVP release. As such, this system ID isn't included in the bootstrap process.*/
export const DEFAULT_TYPE = 'aeebbd5e4d794d24ae99239e9142d9ed';

export const PERSON_TYPE = 'af7ae93b97d64aedad690c1d3da149a1';
export const COMPANY_TYPE = '9cc8a65ddf924c0c8d9024980e822dc0';
export const NONPROFIT_TYPE = 'b3b03c909b6d487cb2e2a7d685f120eb';
export const PROJECT_TYPE = 'cb9d261d456b4eaf87e51e9faa441867';
export const REGION_TYPE = '911a8e0a52f24655a0c6d89cd161bb12';
export const NONPROFIT_SERVICE_TYPE = '2edf4225793741bab2056ac91ab4aab4';
export const FINANCE_OVERVIEW_TYPE = '2cc9d24459ea427f9257f1362a5fa952';
export const FINANCE_SUMMMARY_TYPE = 'ce59ccc12ac54ace8f8209322434733d';
export const TAG_TYPE = '3d31f766b65148afa357271343a773de';
export const TOPIC_TYPE = '1d7f027e415c4f69800e460fde65feb9';
export const GOAL_TYPE = 'f71912463dca4e778a79d9cdc9804127';
export const CLAIM_TYPE = 'fa8e8e54f7424c00b73c05adee2b4545';

export const PAGE_TYPE = '1a9fc4a00fec4eeaa075eec7ebd0d043';
export const TAB_TYPE = '2c72ace7540444559d2265272a94e874';
export const POST_TYPE = '682fbeff41e242cda7f9c4909136a8c5';

export const VALUES_ATTRIBUTE = 'c8e8fd5f011d4c8e8aaf1a2ffc5b48fd';
export const VISION_ATTRIBUTE = 'c670247893c74af48f2a285a46cc19ca';
export const MISSION_ATTRIBUTE = '6db5eaa51cf6463e88f987bd631db044';
export const SPEAKERS_ATTRIBUTE = '03597522e1f2423b882d330cfe89331d';
export const RELEVANT_QUESTIONS_ATTRIBUTE = 'ee5648a5d63847809796cd8605517545';
export const SUPPORTING_ARGUMENTS_ATTRIBUTE = 'cd598fe88dc540fbafc727d363aa2b31';
export const BROADER_CLAIMS_ATTRIBUTE = '8db09ed21a66408eab8d8e8f931a09cf';
export const SOURCES_ATTRIBUTE = '5b4e9b7455f44e57b0b358da71188191';
export const QUOTES_ATTRIBUTE = '4ca754c9a01a4ef2a5d6597c58764529';
export const SUBCLAIMS_ATTRIBUTE = '21d9fa3cfecf42bc8f8e9fcc6ae2b0cd';
export const OPPOSING_ARGUMENTS_ATTRIBUTE = '0c0a2a9519284ec4876dcc04075b7927';
export const BROADER_TOPICS_ATTRIBUTE = '9c2ef1313a1547e9ac5d0fce07e792a1';
export const DEFINITIONS_ATTRIBUTE = '37ae1d79b26e4bf588cb69087a992dc9';
export const RELATED_TOPICS_ATTRIBUTE = '0db47aca1ccf4c9fbeb689519ebe9eed';
export const SUBTOPICS_ATTRIBUTE = '21be6a84312544a2bb2e3c23928ce4aa';
export const TAGS_ATTRIBUTE = '90dcfc330cdb4252a7c3f653d4f54e26';
export const CLAIMS_FROM_ATTRIBUTE = '7fa816a3cb704534934888449869dc33';
export const SUBGOALS_ATTRIBUTE = '377ac7e818ab443cbc2629ff04745f99';
export const BROADER_GOALS_ATTRIBUTE = '2bd0960f5af94b0c893920e9edf31ede';
export const PERSON_ATTRIBUTE = '626e4ad561c349aeaf5e3c80e53cf890';
export const TOPICS_ATTRIBUTE = '5742a7038b734eb6b3df4378c1b512c6';
export const REGION_ATTRIBUTE = '5e4911b82093411ea445bc2124d7f8e3';
export const EMAIL_ATTRIBUTE = 'a89fcd1081b343e48f770d9561a68acd';
export const STREET_ADDRESS_ATTRIBUTE = 'c4b9a30a92a945748f9b31c41eb8bbd8';
export const PHONE_NUMBER_ATTRIBUTE = 'cb36140946954676b62fc2290613a430';
export const NONPROFIT_ID_NUMBER_ATTRIBUTE = 'dcb87494cb91447b9a04625bd1acc804';
export const GOALS_ATTRIBUTE = 'f9804f7c0e2e4658a8489aa65bbe411b';
export const NONPROFIT_CATEGORIES_ATTRIBUTE = 'fca2a465642640bb8e7ecf33742b5346';
export const WEB_URL_ATTRIBUTE = 'e8010874d3304a4d990762e89a19371a';
export const AVATAR_ATTRIBUTE = '235ba0e8dc7e4bdda1e16d0d4497f133';
export const COVER_ATTRIBUTE = '34f535072e6b42c5a84443981a77cfa2';
export const ROLE_ATTRIBUTE = '9c1922f1d7a247d1841d234cb2f56991';

/* Example Usage: SF_Config > FOREIGN_TYPES > Some_Entity */
export const FOREIGN_TYPES = 'be74597305a94cd0a46d1c5538270faf';

/* Example Usage: SF Config > TYPES > SPACE_CONFIGURATION */
export const SPACE_CONFIGURATION = '1d5d0c2adb23466ca0b09abe879df457';

/* Example Usage: Block Entity > TYPES > TABLE_BLOCK */
export const TABLE_BLOCK = '88d5925217ae4d9aa36724710129eb47';

export const SHOWN_COLUMNS = '388ad59b1cc7413ca0bb34a4de48c758';

/* Example Usage: Block Entity > TYPES > TEXT_BLOCK */
export const TEXT_BLOCK = '8426caa143d647d4a6f100c7c1a9a320';

/* Example Usage: Block Entity > TYPES > IMAGE_BLOCK */
export const IMAGE_BLOCK = 'f0553d4d4838425ebcd7613bd8f475a5';

/* Example Usage: Entity > BLOCKS > Some_Entity_Of_Type_TEXT_BLOCK_or_TABLE_BLOCK */
export const BLOCKS = 'beaba5cba67741a8b35377030613fc70';

/* Example Usage: Block Entity > PARENT_ENTITY > Some_Entity_ID */
export const PARENT_ENTITY = 'dd4999b977f04c2ba02b5a26b233854e';

/* Example Usage:
Block Entity > TYPES > TEXT_BLOCK
Block Entity > MARKDOWN_CONTENT > "**hello world!**" */
export const MARKDOWN_CONTENT = 'f88047cebd8d4fbf83f658e84ee533e4';

/* Example Usage:
Block Entity > TYPES > TABLE_BLOCK
Block Entity > ROW_TYPE > Some_Type_ID */
export const ROW_TYPE = '577bd9fbb29e4e2bb5f8f48aedbd26ac';

export const FILTER = 'b0f2d71a79ca4dc49218e3e40dfed103';

export const WALLETS_ATTRIBUTE = '31f6922e0d4e4f14a1ee8c7689457715';

export const PEOPLE_SPACE = '0xb4476A42A66eC1356A58D300555169E17db6756c';

export const BROADER_SPACES = '03aa11edd69a4d5ea0aea0f197614cfd';

/**
 * Addresses for important contracts on our L3.
 *
 * Note: If you want to test deployments on a different network (e.g. local or Mumbai),
 * you can update these addresses to point to the correct contracts on that network.
 */

export const PROFILE_REGISTRY_ADDRESS = '0xc066E89bF7669b905f869Cb936818b0fd0bc456d';
export const MEMBERSHIP_CONTRACT_ADDRESS = '0x34a94160f4B0f86d932927DFfb326354dB279181';

// This is the address for the Root Space.
export const ROOT_SPACE_ADDRESS = '0xEcC4016C71fF38B32f01538207B6F0FdcbCF99f5';

// This represents the beacon for the first set of deployed permissioned spaces.
// We should use this beacon for all new permissioned spaces. We need to track the beacon
// address in case we decide to upgrade the implementation of the permissionless space.
export const PERMISSIONED_SPACE_BEACON_ADDRESS = '0xe44Be15e413169Ad49fB24CBF8db192BE5A9A8bF';
// '0xf7239cb6d1ac800f2025a2571ce32bde190059cb' // mumbai

// This represents the Space contract acting as the registry for all permissioned spaces.
// This is the address for the Root Space.
export const PERMISSIONED_SPACE_REGISTRY_ADDRESS = '0x170b749413328ac9a94762031a7A05b00c1D2e34';

// This represents the beacon for all permissionless spaces. We need to track the beacon
// address in case we decide to upgrade the implementation of the permissionless space.
export const PERMISSIONLESS_SPACE_BEACON_ADDRESS = '0xf14C33B732851ECccA5e2c84a9b0DB6Eb24a5a4A';
// '0xc90513962Db42C1fb44fBb97a8eb0c2E102701Da' // mumbai

// This represents the PermissionlessSpace contract acting as the registry for all
// permissionless spaces.
export const PERMISSIONLESS_SPACE_REGISTRY_ADDRESS = '0x68930a23A91A8FA97C6053cD5057431BaD3eEB52';
// '0x42096035524630382E73cfFAE1CA319CFa72F4dC' // mumbai
