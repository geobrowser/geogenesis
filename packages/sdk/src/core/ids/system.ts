export const ATTRIBUTE = 'GscJ2GELQjmLoaVrYyR3xm';
export const SCHEMA_TYPE = 'VdTsW1mGiy1XSooJaBBLc4';
export const PROPERTIES = '9zBADaYzyfzyFJn4GU1cC';

export const NAME_ATTRIBUTE = 'LuBWqZAu6pz54eiJS5mLv8';
export const DESCRIPTION_ATTRIBUTE = 'LA1DqP5v6QAdsgLPXGF3YA';
export const COVER_ATTRIBUTE = '7YHk6qYkNDaAtNb8GwmysF';
export const TYPES_ATTRIBUTE = 'Jfmby78N4BCseZinBmdVov';
export const TABS_ATTRIBUTE = 'AasCPmGHxVcsswE9PzmNT4';
export const BLOCKS = 'QYbjCM6NT9xmh2hFGsqpQX';

/** Value types */
export const VALUE_TYPE_ATTRIBUTE = 'WQfdWjboZWFuTseDhG5Cw1';
export const CHECKBOX = 'G9NpD4c7GB7nH5YU9Tesgf';
export const TIME = '3mswMrL91GuYTfBq29EuNE';
export const TEXT = 'LckSTmjBrYAJaFcDs89am5';
export const URL = '5xroh3gbWYbWY4oR3nFXzy';
export const NUMBER = 'LBdMpTNyycNffsF51t2eSp';
export const POINT = 'UZBZNbA7Uhx1f8ebLi1Qj5';
export const IMAGE = 'X8KB1uF84RYppghBSVvhqr';

export const RELATION = 'AKDxovGvZaPSWnmKnSoZJY';

export const SPACE_TYPE = '7gzF671tq5JTZ13naG4tnr';

/**
 * Defines the relation value types for a relation. e.g., a Persons
 * attribute must only contain relations where the to entity is type
 * Person
 */
export const RELATION_VALUE_RELATIONSHIP_TYPE = 'LdAS7yWqF32E2J4doUDe5u';

export const IMAGE_TYPE = 'Q1LaZhnzj8AtCzx8T1HRMf';
export const IMAGE_FILE_TYPE_ATTRIBUTE = 'B3nyKkmERhFEcaVgoe6kAL';
export const IMAGE_HEIGHT_ATTRIBUTE = 'GjaFuBBB8z63y9qr8dhaSP';
export const IMAGE_URL_ATTRIBUTE = 'J6cw1v8xUHCFsEdPeuB1Uo';
export const IMAGE_WIDTH_ATTRIBUTE = 'Xb3useEUkWV1Y9zYYkq4xp';

/** Data blocks */
// @TODO: data block instead of TABLE_BLOCK
export const DATA_BLOCK = 'PnQsGwnnztrLNRCm9mcKKY';
export const DATA_SOURCE_ATTRIBUTE = 'J8nmVHZDeCLNhPxX7qyEZG';
export const ALL_OF_GEO_DATA_SOURCE = 'XqDkiYjqEufsbjqegxkqZU';
export const COLLECTION_DATA_SOURCE = '3J6223VX6MkwTftWdzDfo4';
export const QUERY_DATA_SOURCE = '8HkP7HCufp2HcCFajuJFcq';

/**
 * Defines the filters applied to a data block. It applies whether
 * the data block is a COLLECTION or a QUERY.
 *
 * See the Filters spec to see the Filter format.
 */
export const FILTER = '3YqoLJ7uAPmthXyXmXKoSa';
export const SPACE_FILTER = 'JiFmyuFYeoiRSiY286m7A2';
export const ENTITY_FILTER = 'TWrUhTe6E8tKCJr9vfCzxT';

/**
 * Defines that a relation type is COLLECTION_ITEM. This is used by
 * data blocks with the COLLECTION_DATA_SOURCE to denote that a relation
 * should be consumed as a collection item in the block.
 *
 * Collections enable data blocks to render arbitrarily selected entities
 * rather than the results of a query. A collection item defines what
 * these selected entities are.
 */
export const COLLECTION_ITEM_RELATION_TYPE = 'Mwrn46KavwfWgNrFaWcB9j';

/**
 * Defines the view type for a data block, either a {@link TABLE_VIEW},
 * {@link GALLERY_VIEW} or a {@link LIST_VIEW}. Your own application
 * can define their own views with their own IDs.
 *
 * This view data lives on the relation pointing to the block. This enables
 * different consumers of the data block to define their own views.
 */
export const VIEW_ATTRIBUTE = '46GzPiTRPG36jX9dmNE9ic';

export const VIEW_TYPE = '52itq1wC2HciX6gd9HEZPN';
export const TABLE_VIEW = 'S9T1TPras3iPkVvrS5CoKE';
export const LIST_VIEW = 'GUKPGARFBFBMoET6NGQctJ';
export const GALLERY_VIEW = 'SHBs5faKV8gDeZgsUoVUQF';

/**
 * Defines the columns to show on a data block when in {@link TABLE_VIEW}.
 */
export const SHOWN_COLUMNS = '9AecPe8JTN7uJRaX1Mk1XV';

/**
 * Defines the type of data source for a data block, either a
 * {@link COLLECTION_DATA_SOURCE}, an {@link ALL_OF_GEO_DATA_SOURCE} or
 * a {@link QUERY_DATA_SOURCE}
 */
export const DATA_SOURCE_TYPE_RELATION_TYPE = '4sz7Kx91uq4KBW5sohjLkj';

export const IMAGE_BLOCK = 'V6R8hWrKfLZmtyv4dQyyzo';
export const TEXT_BLOCK = 'Fc836HBAyTaLaZgBzcTS2a';

export const MARKDOWN_CONTENT = 'V9A2298ZHL135zFRH4qcRg';

/**
 * Relations define an entity which represents a relationship between
 * two entities. Modeling this relationship as a from -> to means that
 * we can add extra data about the relationship to the entity itself
 * rather than to either of the from or to entities.
 *
 * e.g., John and Jane are married and you want to add a marriage date
 * to represent when they were married. It does not make sense to add
 * the date to John and Jane directly, since the data is about the
 * marriage itself, and not John or Jane. This representation of the
 * marriage also only exists in the context of John and Jane.
 */
export const RELATION_TYPE = 'QtC4Ay8HNLwSd1kSARgcDE';
export const RELATION_FROM_ATTRIBUTE = 'RERshk4JoYoMC17r1qAo9J';
export const RELATION_TO_ATTRIBUTE = 'Qx8dASiTNsxxP3rJbd4Lzd';
export const RELATION_TYPE_ATTRIBUTE = '3WxYoAVreE4qFhkDUs5J3q';
/*
 * Relations can be ordered using fractional indexing. By default we
 * add an index to every relation so that ordering can be added to
 * any relation at any point without having to add indexes to relations
 * post-creation.
 */
export const RELATION_INDEX = 'WNopXUYxsSsE51gkJGWghe';

/**
 * Defines whether a relation has been "verified." Verification can
 * mean different things semantically for different spaces. This
 * flag provides a means for spaces to build UIs or tooling around
 * a semantically verified entity. It's possible for relations to
 * point to entities which aren't verified, and it's up to spaces
 * to decide what "verified" means for them.
 *
 * e.g.
 * a link to a Person might be verified in that the linked space
 * is the correct one to represent this Person from the perspective
 * of the current space.
 */
export const VERIFIED_SOURCE_ATTRIBUTE = '5jodArZNFzucsYzQaDVFBL';
export const SOURCE_SPACE_ATTRIBUTE = 'GzkEQP3yedWjXE8QPFKEwV';

/** Core types */
export const ACADEMIC_FIELD_TYPE = 'ExCjm3rzYVfpMRwDchdrEe';
export const COMPANY_TYPE = 'UhpHYoFEzAov9WwqtDwQk4';
export const DAO_TYPE = 'Hh8hc47TMBvRsD4oqUNxP9';
export const GOVERNMENT_ORG_TYPE = 'MokrHqV4jZhBfPN3mLPjM8';
export const INDUSTRY_TYPE = 'YA7mhzaafD2vnjekmcnLER';
export const INTEREST_TYPE = '6VSi54UDKnL34BWHBqdzee';
export const NONPROFIT_TYPE = 'RemzN69c24othsp2rP7yMX';
export const POST_TYPE = 'X7KuZJQewaCiCy9QV2vjyv';
export const PROJECT_TYPE = '9vk7Q3pz7US3s2KePFQrJT';
export const PROTOCOL_TYPE = 'R9Xo87Q6oaxfSBrHvVQFdS';
export const REGION_TYPE = 'Qu6vfQq68ecZ4PkihJ4nZN';
export const ROOT_SPACE_TYPE = 'k7vbnMPxzdtGL2J3uaB6d';

/** Templates */
export const TEMPLATE_ATTRIBUTE = 'Sb7ZvdGsCDm2r1mNZBA5ft';
export const PAGE_TYPE = '9u4zseS3EDXG9ZvwR9RmqU';
/**
 * Defines the page type for a template. e.g., an events page, a
 * finances page, a products page, etc.
 */
export const PAGE_TYPE_ATTRIBUTE = 'DD9FKRZ3XezaKEGUszMB3r';

/**
  These define the entity id to copy when creating an entity from
  a template.
  */
export const COMPANY_TEMPLATE = 'QZwChwTixtbLDv3HSX5E6n';
export const DAO_TEMPLATE = 'Gfj89RHeFexx36V5kN6LhB';
export const INDUSTRY_TEMPLATE = 'Tgm2ubmm9VjAZFZACJLTZC';
export const INTEREST_TEMPLATE = 'C7XkQKqhRHv28Uuo5m2DZP';
export const NONPROFIT_TEMPLATE = 'HEuj9VYAF5z1KQ8x37Uzze';
export const PERSON_TEMPLATE = 'EJuFuEz17wdVCk9ctEAkW7';
export const PROTOCOL_TEMPLATE = 'UKKzBPkwY51qcVB9QTLNB6';
export const REGION_TEMPLATE = 'RL8uWpewpYdcmJ3rjoudjT';

export const ONTOLOGY_PAGE_TEMPLATE = 'JjEDWDpLYS7tYBKi4vCdwc';
export const EDUCATION_PAGE_TEMPLATE = 'RHuzjGkGothjuwGN6TLXDx';
export const ABOUT_PAGE_TEMPLATE = '78qghJm6whF5proE9G93pX';

/**
 * Defines the type of the page being copied when creating an entity
 * from a template.
 */
export const ABOUT_PAGE = 'Xn4sgn16Peoe64NSoARRv4';
export const ACTIVITIES_PAGE = 'zfgeDtfzvmt9xbWVJj9DE';
export const CULTURE_PAGE = 'EJuJfWHqXnorH4zbLgawC';
export const EDUCATION_PAGE = 'Qh8AQ8hQhXiaAbe8HkgAJV';
export const EVENTS_PAGE = 'K97FaTqrx54jdiM93vZ1Fc';
export const FINANCES_PAGE = 'R6FDYEK9CCdEQuxjuRjA2U';
export const GOVERNMENT_PAGE = 'AyQpCWpt4p58B4CFu6GYPJ';
export const JOBS_PAGE = 'PJzxY3isAL3hGx1bRkYdPf';
export const NEWS_PAGE = 'Ss6NVRoX8HKaEyFTEYNdUv';
export const ONTOLOGY_PAGE = 'Ee2Es1b9PkfnR7nsbY2ubE';
export const PEOPLE_PAGE = '5PatoErephYf1ZJ8U6rNz8';
export const PERSONAL_PAGE = 'NPiVay5xbawmNJu7E1FLD';
export const PLACES_PAGE = 'VAuhjqTMdZ2UR4Hj1TekTh';
export const POSTS_PAGE = 'E3jboNrTeuopjKgJ45ykBd';
export const PRODUCTS_PAGE = 'Cnf53HgY8T7Fwcq8choaRn';
export const PROFESSIONAL_PAGE = 'RTdzv7qaBfjrSKbEnvCdaT';
export const PROJECTS_PAGE = '3scJVFciFuhmaXe852pT3F';
export const SERVICES_PAGE = '2V8pajmGDJt8egodkJeoPC';
export const SPACES_PAGE = 'JAPV1HvzUBXH1advi47FWN';
export const TEAM_PAGE = 'BWMHGbpR31xTbjvk4QZdQA';

export const FINANCE_OVERVIEW_TYPE = '5LHixDnR2vBTx26kmbnyih';
export const FINANCE_SUMMMARY_TYPE = '8zrMWkTeDkfxbGn1U1MjLx';

/** Identity */
export const ACCOUNT_TYPE = 'S7rX6suDMmU75yjbAD5WsP';
export const ACCOUNTS_ATTRIBUTE = 'VA5i7mm1v3QMjUChMT5dPs';
export const ADDRESS_ATTRIBUTE = 'HXLpAZyQkcy6Di4YJu4xzU';
export const NETWORK_ATTRIBUTE = 'MuMLDVbHAmRjZQjhyk3HGx';
export const PERSON_TYPE = 'GfN9BK2oicLiBHrUavteS8';
export const NETWORK_TYPE = 'YCLXoVZho6C4S51g4AbF3C';

export const GOALS_ATTRIBUTE = 'WNcdorfdj7ZprmwvmRiRtG';
export const GOAL_TYPE = '2y44qmFiLjZWmgkZ64EM7c';
export const MEMBERSHIP_CONTRACT_ADDRESS = 'DDkwCoB8p1mHzXTedShcFv';
export const MISSION_ATTRIBUTE = 'VGbyCo12NC8yTUhnhMHu1z';
export const PLACEHOLDER_IMAGE = 'ENYn2afpf2koqBfyff7CGE';
export const PLACEHOLDER_TEXT = 'AuihGk1yXCkfCcpMSwhfho';
export const TAB_TYPE = '6ym81VzJiHx32nV8e5h52q';
export const ROLE_ATTRIBUTE = 'VGKSRGzxCRvQxpJP7CB4wj';

// Do we still need these?
export const DEFAULT_TYPE = '7nJuuYkrKT62HCFxDygF1S';
export const BROADER_CLAIMS_ATTRIBUTE = 'RWkXuBRdVqDAiHKQisTZZ4';
export const CLAIMS_FROM_ATTRIBUTE = 'JdNBawSt1fp9EdozJdmThR';
export const DEFINITIONS_ATTRIBUTE = '256myJaotY6FB6wGiC5mtk';
export const EMAIL_ATTRIBUTE = '2QafYRmRHP2Hd18W3Tj9zu';
export const FOREIGN_TYPES = 'R32hqus9ojU3Twsz3HDuxf';
export const NONPROFIT_CATEGORIES_ATTRIBUTE = '64uVL5vKHmfqBC94hwNzHZ';
export const PHONE_NUMBER_ATTRIBUTE = '3zhuyrcqFjeaVgC5oHHqTJ';
export const QUOTES_ATTRIBUTE = 'XXAf2w4C5f4URDhhpH8nUG';
export const REGION_ATTRIBUTE = 'CGC6KXy8wcqf7vpZv8HH4i';
export const RELATED_TOPICS_ATTRIBUTE = 'SDw38koZeFukda9FWU9bfW';
export const RELEVANT_QUESTIONS_ATTRIBUTE = 'Po4uUtzinhjDwXJP5QNCMp';
export const SPEAKERS_ATTRIBUTE = '9nZuGhssmkEBn9DtRca8Gm';
export const STREET_ADDRESS_ATTRIBUTE = '8kx7oQvdCZRXLfUksucwCv';
export const SUBCLAIMS_ATTRIBUTE = '2DFyYPbh5Yy2PnWTbi3uL5';
export const VALUES_ATTRIBUTE = '3c5k2MpF9PRYAZ925qTKNi';
export const VISION_ATTRIBUTE = 'AAMDNTaJtS2i4aWp59zEAk';

export const ROOT_SPACE_ID = '25omwWh6HYgeRQKCaSpVpa';
