import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import {
  ATTRIBUTE,
  ATTRIBUTES,
  AVATAR_ATTRIBUTE,
  BLOCKS,
  COVER_ATTRIBUTE,
  DESCRIPTION,
  FILTER,
  FOREIGN_TYPES,
  IMAGE,
  IMAGE_ATTRIBUTE,
  IMAGE_BLOCK,
  MARKDOWN_CONTENT,
  NAME,
  PARENT_ENTITY,
  PERSON_TYPE,
  RELATION,
  ROW_TYPE,
  SCHEMA_TYPE,
  SPACE,
  SPACE_CONFIGURATION,
  TABLE_BLOCK,
  SHOWN_COLUMNS,
  TEXT,
  TEXT_BLOCK,
  TYPES,
  VALUE_TYPE,
  RELATION_VALUE_RELATIONSHIP_TYPE,
  DATE,
  WEB_URL,
  WALLETS_ATTRIBUTE,
  NONPROFIT_TYPE,
  PROJECT_TYPE,
  TOPICS_ATTRIBUTE,
  REGION_ATTRIBUTE,
  EMAIL_ATTRIBUTE,
  STREET_ADDRESS_ATTRIBUTE,
  PHONE_NUMBER_ATTRIBUTE,
  NONPROFIT_ID_NUMBER_ATTRIBUTE,
  WEB_URL_ATTRIBUTE,
  GOALS_ATTRIBUTE,
  NONPROFIT_CATEGORIES_ATTRIBUTE,
  REGION_TYPE,
  NONPROFIT_SERVICE_TYPE,
  BROADER_GOALS_ATTRIBUTE,
  SUBGOALS_ATTRIBUTE,
  CLAIMS_FROM_ATTRIBUTE,
  TAGS_ATTRIBUTE,
  TAG_TYPE,
  TOPIC_TYPE,
  GOAL_TYPE,
  SUBTOPICS_ATTRIBUTE,
  RELATED_TOPICS_ATTRIBUTE,
  DEFINITIONS_ATTRIBUTE,
  BROADER_TOPICS_ATTRIBUTE,
  CLAIM_TYPE,
  OPPOSING_ARGUMENTS_ATTRIBUTE,
  SUBCLAIMS_ATTRIBUTE,
  QUOTES_ATTRIBUTE,
  SOURCES_ATTRIBUTE,
  BROADER_CLAIMS_ATTRIBUTE,
  SUPPORTING_ARGUMENTS_ATTRIBUTE,
  RELEVANT_QUESTIONS_ATTRIBUTE,
  SPEAKERS_ATTRIBUTE,
} from '@geogenesis/ids/system-ids'
import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import {
  createProposedVersion,
  createVersion,
  getOrCreateActionCount,
  handleAction,
} from './actions'
import { getEntityId, getOrCreateProposal } from './add-entry'

const entities: string[] = [
  TYPES,
  ATTRIBUTES,
  SCHEMA_TYPE,
  VALUE_TYPE,
  RELATION,
  TEXT,
  IMAGE,
  IMAGE_ATTRIBUTE,
  DESCRIPTION,
  NAME,
  SPACE,
  ATTRIBUTE,
  SPACE_CONFIGURATION,
  FOREIGN_TYPES,
  TABLE_BLOCK,
  SHOWN_COLUMNS,
  TEXT_BLOCK,
  IMAGE_BLOCK,
  BLOCKS,
  MARKDOWN_CONTENT,
  ROW_TYPE,
  PARENT_ENTITY,
  RELATION_VALUE_RELATIONSHIP_TYPE,
  DATE,
  WEB_URL,
  PERSON_TYPE,
  NONPROFIT_TYPE,
  PROJECT_TYPE,
  TOPICS_ATTRIBUTE,
  TOPIC_TYPE,
  REGION_ATTRIBUTE,
  EMAIL_ATTRIBUTE,
  STREET_ADDRESS_ATTRIBUTE,
  PHONE_NUMBER_ATTRIBUTE,
  NONPROFIT_ID_NUMBER_ATTRIBUTE,
  WEB_URL_ATTRIBUTE,
  GOALS_ATTRIBUTE,
  NONPROFIT_CATEGORIES_ATTRIBUTE,
  REGION_TYPE,
  NONPROFIT_SERVICE_TYPE,
  BROADER_GOALS_ATTRIBUTE,
  SUBGOALS_ATTRIBUTE,
  CLAIMS_FROM_ATTRIBUTE,
  TAGS_ATTRIBUTE,
  TAG_TYPE,
  GOAL_TYPE,
  SUBTOPICS_ATTRIBUTE,
  RELATED_TOPICS_ATTRIBUTE,
  DEFINITIONS_ATTRIBUTE,
  BROADER_TOPICS_ATTRIBUTE,
  CLAIM_TYPE,
  OPPOSING_ARGUMENTS_ATTRIBUTE,
  SUBCLAIMS_ATTRIBUTE,
  QUOTES_ATTRIBUTE,
  SOURCES_ATTRIBUTE,
  BROADER_CLAIMS_ATTRIBUTE,
  SUPPORTING_ARGUMENTS_ATTRIBUTE,
  RELEVANT_QUESTIONS_ATTRIBUTE,
  SPEAKERS_ATTRIBUTE,
]

class Tuple<T, U> {
  _0: T
  _1: U
}

const names: Tuple<string, StringValue>[] = [
  { _0: TYPES, _1: new StringValue(TYPES, 'Types') },
  { _0: NAME, _1: new StringValue(NAME, 'Name') },
  { _0: ATTRIBUTE, _1: new StringValue(ATTRIBUTE, 'Attribute') },
  { _0: SPACE, _1: new StringValue(SPACE, 'Indexed Space') },
  { _0: ATTRIBUTES, _1: new StringValue(ATTRIBUTES, 'Attributes') },
  { _0: SCHEMA_TYPE, _1: new StringValue(SCHEMA_TYPE, 'Type') },
  { _0: VALUE_TYPE, _1: new StringValue(VALUE_TYPE, 'Value type') },
  { _0: RELATION, _1: new StringValue(RELATION, 'Relation') },
  { _0: TEXT, _1: new StringValue(TEXT, 'Text') },
  { _0: IMAGE, _1: new StringValue(IMAGE, 'Image') },
  { _0: DATE, _1: new StringValue(DATE, 'Date') },
  { _0: WEB_URL, _1: new StringValue(WEB_URL, 'Web URL') },
  { _0: IMAGE_ATTRIBUTE, _1: new StringValue(IMAGE_ATTRIBUTE, 'Image') },
  { _0: DESCRIPTION, _1: new StringValue(DESCRIPTION, 'Description') },
  {
    _0: SPACE_CONFIGURATION,
    _1: new StringValue(SPACE_CONFIGURATION, 'Space'),
  },
  { _0: FOREIGN_TYPES, _1: new StringValue(FOREIGN_TYPES, 'Foreign Types') },
  { _0: TABLE_BLOCK, _1: new StringValue(TABLE_BLOCK, 'Table Block') },
  { _0: SHOWN_COLUMNS, _1: new StringValue(SHOWN_COLUMNS, 'Shown Columns') },
  { _0: TEXT_BLOCK, _1: new StringValue(TEXT_BLOCK, 'Text Block') },
  { _0: IMAGE_BLOCK, _1: new StringValue(IMAGE_BLOCK, 'Image Block') },
  { _0: BLOCKS, _1: new StringValue(BLOCKS, 'Blocks') },
  { _0: PARENT_ENTITY, _1: new StringValue(PARENT_ENTITY, 'Parent Entity') },
  { _0: PERSON_TYPE, _1: new StringValue(PERSON_TYPE, 'Person') },
  { _0: REGION_TYPE, _1: new StringValue(PERSON_TYPE, 'Region') },
  { _0: TAG_TYPE, _1: new StringValue(TAG_TYPE, 'Tag') },
  { _0: GOAL_TYPE, _1: new StringValue(GOAL_TYPE, 'Goal') },
  { _0: TOPIC_TYPE, _1: new StringValue(TOPIC_TYPE, 'Topic') },
  { _0: CLAIM_TYPE, _1: new StringValue(CLAIM_TYPE, 'Claim') },
  {
    _0: NONPROFIT_SERVICE_TYPE,
    _1: new StringValue(PERSON_TYPE, 'Nonprofit service'),
  },
  {
    _0: NONPROFIT_TYPE,
    _1: new StringValue(NONPROFIT_TYPE, 'Nonprofit Organization'),
  },
  {
    _0: PROJECT_TYPE,
    _1: new StringValue(PROJECT_TYPE, 'Project'),
  },
  {
    _0: TOPICS_ATTRIBUTE,
    _1: new StringValue(TOPICS_ATTRIBUTE, 'Topics'),
  },
  {
    _0: REGION_ATTRIBUTE,
    _1: new StringValue(REGION_ATTRIBUTE, 'Region'),
  },
  {
    _0: EMAIL_ATTRIBUTE,
    _1: new StringValue(EMAIL_ATTRIBUTE, 'Email'),
  },
  {
    _0: STREET_ADDRESS_ATTRIBUTE,
    _1: new StringValue(STREET_ADDRESS_ATTRIBUTE, 'Street address'),
  },
  {
    _0: PHONE_NUMBER_ATTRIBUTE,
    _1: new StringValue(PHONE_NUMBER_ATTRIBUTE, 'Phone number'),
  },
  {
    _0: NONPROFIT_ID_NUMBER_ATTRIBUTE,
    _1: new StringValue(NONPROFIT_ID_NUMBER_ATTRIBUTE, 'Nonprofit ID #'),
  },
  {
    _0: WEB_URL_ATTRIBUTE,
    _1: new StringValue(WEB_URL_ATTRIBUTE, 'Web URL'),
  },
  {
    _0: GOALS_ATTRIBUTE,
    _1: new StringValue(GOALS_ATTRIBUTE, 'Goals'),
  },
  {
    _0: NONPROFIT_CATEGORIES_ATTRIBUTE,
    _1: new StringValue(NONPROFIT_CATEGORIES_ATTRIBUTE, 'Nonprofit categories'),
  },
  {
    _0: BROADER_GOALS_ATTRIBUTE,
    _1: new StringValue(BROADER_GOALS_ATTRIBUTE, 'Broader goals'),
  },
  {
    _0: SUBGOALS_ATTRIBUTE,
    _1: new StringValue(SUBGOALS_ATTRIBUTE, 'Subgoals'),
  },
  {
    _0: CLAIMS_FROM_ATTRIBUTE,
    _1: new StringValue(CLAIMS_FROM_ATTRIBUTE, 'Claims from'),
  },
  {
    _0: TAGS_ATTRIBUTE,
    _1: new StringValue(TAGS_ATTRIBUTE, 'Tags'),
  },
  {
    _0: SUBTOPICS_ATTRIBUTE,
    _1: new StringValue(SUBTOPICS_ATTRIBUTE, 'Subtopics'),
  },
  {
    _0: RELATED_TOPICS_ATTRIBUTE,
    _1: new StringValue(RELATED_TOPICS_ATTRIBUTE, 'Related topics'),
  },
  {
    _0: DEFINITIONS_ATTRIBUTE,
    _1: new StringValue(DEFINITIONS_ATTRIBUTE, 'Definitions'),
  },
  {
    _0: BROADER_TOPICS_ATTRIBUTE,
    _1: new StringValue(BROADER_TOPICS_ATTRIBUTE, 'Broader topics'),
  },
  {
    _0: OPPOSING_ARGUMENTS_ATTRIBUTE,
    _1: new StringValue(OPPOSING_ARGUMENTS_ATTRIBUTE, 'Opposing arguments'),
  },
  {
    _0: SUBCLAIMS_ATTRIBUTE,
    _1: new StringValue(SUBCLAIMS_ATTRIBUTE, 'Subclaims'),
  },
  {
    _0: QUOTES_ATTRIBUTE,
    _1: new StringValue(QUOTES_ATTRIBUTE, 'Quotes'),
  },
  {
    _0: SOURCES_ATTRIBUTE,
    _1: new StringValue(SOURCES_ATTRIBUTE, 'Sources'),
  },
  {
    _0: BROADER_CLAIMS_ATTRIBUTE,
    _1: new StringValue(BROADER_CLAIMS_ATTRIBUTE, 'Broader claims'),
  },
  {
    _0: SUPPORTING_ARGUMENTS_ATTRIBUTE,
    _1: new StringValue(SUPPORTING_ARGUMENTS_ATTRIBUTE, 'Supporting arguments'),
  },
  {
    _0: RELEVANT_QUESTIONS_ATTRIBUTE,
    _1: new StringValue(RELEVANT_QUESTIONS_ATTRIBUTE, 'Relevant questions'),
  },
  {
    _0: SPEAKERS_ATTRIBUTE,
    _1: new StringValue(SPEAKERS_ATTRIBUTE, 'Speakers'),
  },
  {
    _0: MARKDOWN_CONTENT,
    _1: new StringValue(MARKDOWN_CONTENT, 'Markdown Content'),
  },
  { _0: ROW_TYPE, _1: new StringValue(ROW_TYPE, 'Row Type') },
  { _0: AVATAR_ATTRIBUTE, _1: new StringValue(AVATAR_ATTRIBUTE, 'Avatar') },
  { _0: COVER_ATTRIBUTE, _1: new StringValue(COVER_ATTRIBUTE, 'Cover') },
  { _0: FILTER, _1: new StringValue(FILTER, 'Filter') },
  { _0: WALLETS_ATTRIBUTE, _1: new StringValue(WALLETS_ATTRIBUTE, 'Wallets') },
  {
    _0: RELATION_VALUE_RELATIONSHIP_TYPE,
    _1: new StringValue(
      RELATION_VALUE_RELATIONSHIP_TYPE,
      'Relation Value Types'
    ),
  },
]

/* Multi-dimensional array of [EntityId, ValueType] */
const attributes: Tuple<string, string>[] = [
  { _0: TYPES, _1: RELATION },
  { _0: ATTRIBUTES, _1: RELATION },
  { _0: VALUE_TYPE, _1: RELATION },
  { _0: IMAGE_ATTRIBUTE, _1: TEXT },
  { _0: DESCRIPTION, _1: TEXT },
  { _0: NAME, _1: TEXT },
  { _0: SPACE, _1: TEXT },
  { _0: FOREIGN_TYPES, _1: RELATION },
  { _0: MARKDOWN_CONTENT, _1: TEXT },
  { _0: ROW_TYPE, _1: RELATION },
  { _0: BLOCKS, _1: RELATION },
  { _0: PARENT_ENTITY, _1: RELATION },
  { _0: FILTER, _1: TEXT },
  { _0: RELATION_VALUE_RELATIONSHIP_TYPE, _1: RELATION },
  { _0: AVATAR_ATTRIBUTE, _1: IMAGE },
  { _0: COVER_ATTRIBUTE, _1: IMAGE },
  { _0: WALLETS_ATTRIBUTE, _1: RELATION },
  { _0: TOPICS_ATTRIBUTE, _1: RELATION },
  { _0: REGION_ATTRIBUTE, _1: RELATION },
  { _0: EMAIL_ATTRIBUTE, _1: TEXT },
  { _0: STREET_ADDRESS_ATTRIBUTE, _1: TEXT },
  { _0: PHONE_NUMBER_ATTRIBUTE, _1: TEXT },
  { _0: NONPROFIT_ID_NUMBER_ATTRIBUTE, _1: TEXT },
  { _0: WEB_URL_ATTRIBUTE, _1: WEB_URL },
  { _0: GOALS_ATTRIBUTE, _1: RELATION },
  { _0: NONPROFIT_CATEGORIES_ATTRIBUTE, _1: RELATION },
  { _0: BROADER_GOALS_ATTRIBUTE, _1: RELATION },
  { _0: SUBGOALS_ATTRIBUTE, _1: RELATION },
  { _0: CLAIMS_FROM_ATTRIBUTE, _1: RELATION },
  { _0: TAGS_ATTRIBUTE, _1: RELATION },
  { _0: SUBTOPICS_ATTRIBUTE, _1: RELATION },
  { _0: RELATED_TOPICS_ATTRIBUTE, _1: RELATION },
  { _0: DEFINITIONS_ATTRIBUTE, _1: RELATION },
  { _0: BROADER_TOPICS_ATTRIBUTE, _1: RELATION },
  { _0: OPPOSING_ARGUMENTS_ATTRIBUTE, _1: RELATION },
  { _0: SUBCLAIMS_ATTRIBUTE, _1: RELATION },
  { _0: QUOTES_ATTRIBUTE, _1: RELATION },
  { _0: SOURCES_ATTRIBUTE, _1: RELATION },
  { _0: BROADER_CLAIMS_ATTRIBUTE, _1: RELATION },
  { _0: SUPPORTING_ARGUMENTS_ATTRIBUTE, _1: RELATION },
  { _0: RELEVANT_QUESTIONS_ATTRIBUTE, _1: RELATION },
  { _0: SPEAKERS_ATTRIBUTE, _1: RELATION },
]

/* Multi-dimensional array of [TypeId, [Attributes]] */
const types: Tuple<string, string[]>[] = [
  { _0: TEXT, _1: [] },
  { _0: RELATION, _1: [] },
  { _0: IMAGE, _1: [] },
  { _0: DATE, _1: [] },
  { _0: WEB_URL, _1: [] },
  { _0: ATTRIBUTE, _1: [VALUE_TYPE] },
  { _0: SCHEMA_TYPE, _1: [ATTRIBUTES] },
  { _0: SPACE_CONFIGURATION, _1: [FOREIGN_TYPES] },
  { _0: IMAGE_BLOCK, _1: [IMAGE_ATTRIBUTE, PARENT_ENTITY] },
  { _0: TABLE_BLOCK, _1: [ROW_TYPE, PARENT_ENTITY] },
  { _0: TEXT_BLOCK, _1: [MARKDOWN_CONTENT, PARENT_ENTITY] },
  { _0: PERSON_TYPE, _1: [AVATAR_ATTRIBUTE, COVER_ATTRIBUTE] },
  { _0: NONPROFIT_SERVICE_TYPE, _1: [AVATAR_ATTRIBUTE, COVER_ATTRIBUTE] },
  { _0: REGION_TYPE, _1: [] },
  { _0: TAG_TYPE, _1: [] },
  {
    _0: CLAIM_TYPE,
    _1: [
      OPPOSING_ARGUMENTS_ATTRIBUTE,
      SUBCLAIMS_ATTRIBUTE,
      QUOTES_ATTRIBUTE,
      TOPICS_ATTRIBUTE,
      SOURCES_ATTRIBUTE,
      BROADER_CLAIMS_ATTRIBUTE,
      TAGS_ATTRIBUTE,
      SUPPORTING_ARGUMENTS_ATTRIBUTE,
      RELEVANT_QUESTIONS_ATTRIBUTE,
      TYPES,
    ],
  },
  {
    _0: TOPIC_TYPE,
    _1: [
      SPEAKERS_ATTRIBUTE,
      RELATED_TOPICS_ATTRIBUTE,
      SUBTOPICS_ATTRIBUTE,
      COVER_ATTRIBUTE,
      DEFINITIONS_ATTRIBUTE,
      CLAIMS_FROM_ATTRIBUTE,
      TAGS_ATTRIBUTE,
      BROADER_TOPICS_ATTRIBUTE,
      TYPES,
    ],
  },
  {
    _0: GOAL_TYPE,
    _1: [
      BROADER_GOALS_ATTRIBUTE,
      COVER_ATTRIBUTE,
      SUBGOALS_ATTRIBUTE,
      TOPICS_ATTRIBUTE,
      CLAIMS_FROM_ATTRIBUTE,
      TAGS_ATTRIBUTE,
    ],
  },
  {
    _0: NONPROFIT_TYPE,
    _1: [
      TOPICS_ATTRIBUTE,
      REGION_ATTRIBUTE,
      EMAIL_ATTRIBUTE,
      STREET_ADDRESS_ATTRIBUTE,
      PHONE_NUMBER_ATTRIBUTE,
      NONPROFIT_ID_NUMBER_ATTRIBUTE,
      WEB_URL_ATTRIBUTE,
      GOALS_ATTRIBUTE,
      NONPROFIT_CATEGORIES_ATTRIBUTE,
    ],
  },
  {
    _0: PROJECT_TYPE,
    _1: [AVATAR_ATTRIBUTE, COVER_ATTRIBUTE],
  },
]

export function bootstrapRootSpaceCoreTypes(
  space: string,
  createdAtBlock: BigInt,
  createdAtTimestamp: BigInt,
  createdBy: Address
): void {
  log.debug(`Bootstrapping root space ${space}!`, [])

  const proposalId = getOrCreateActionCount().count.toString()

  getOrCreateProposal(
    proposalId,
    createdBy,
    createdAtTimestamp,
    space,
    `Creating initial types for ${space}`,
    createdAtBlock
  )

  const entityToActionIds = new Map<string, string[]>()

  /* Create all of our entities */
  for (let i = 0; i < entities.length; i++) {
    const action = new CreateEntityAction(entities[i])
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }
  }

  /* Name all of our entities */
  for (let i = 0; i < names.length; i++) {
    const action = new CreateTripleAction(
      names[i]._0 as string,
      NAME,
      names[i]._1 as StringValue
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }
  }

  /* Create our attributes of type "attribute" */
  for (let i = 0; i < attributes.length; i++) {
    const action = new CreateTripleAction(
      attributes[i]._0 as string,
      TYPES,
      new EntityValue(ATTRIBUTE)
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }

    const action2 = new CreateTripleAction(
      attributes[i]._0 as string,
      VALUE_TYPE,
      new EntityValue(attributes[i]._1 as string)
    )
    const entityId2 = getEntityId(action2)
    const actionId2 = handleAction(action2, space, createdAtBlock)

    if (entityId2 && actionId2) {
      const isSet = entityToActionIds.has(entityId2)
      if (isSet) {
        const actions = entityToActionIds.get(entityId2)
        entityToActionIds.set(entityId2, actions.concat([actionId2]))
      } else {
        entityToActionIds.set(entityId2, [actionId2])
      }
    }
  }

  /* Create our types of type "type" */
  for (let i = 0; i < types.length; i++) {
    const action = new CreateTripleAction(
      types[i]._0 as string,
      TYPES,
      new EntityValue(SCHEMA_TYPE)
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }

    /* Each type can have a set of attributes */
    for (let j = 0; j < types[i]._1.length; j++) {
      const action = new CreateTripleAction(
        types[i]._0 as string,
        ATTRIBUTES,
        new EntityValue(types[i]._1[j] as string)
      )
      const entityId = getEntityId(action)
      const actionId = handleAction(action, space, createdAtBlock)

      if (entityId && actionId) {
        const isSet = entityToActionIds.has(entityId)
        if (isSet) {
          const actions = entityToActionIds.get(entityId)
          entityToActionIds.set(entityId, actions.concat([actionId]))
        } else {
          entityToActionIds.set(entityId, [actionId])
        }
      }
    }

    // for every key in the map,
    const entityIds = entityToActionIds.keys()

    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i]
      const actionIds = entityToActionIds.get(entityIds[i])

      let proposedVersion = createProposedVersion(
        getOrCreateActionCount().count.toString(),
        createdAtTimestamp,
        actionIds,
        entityId,
        createdBy,
        proposalId,
        `Creating initial types for ${space}`,
        createdAtBlock
      )

      createVersion(
        entityId + '-' + getOrCreateActionCount().count.toString(),
        proposedVersion.id,
        createdAtTimestamp,
        entityId,
        createdBy,
        `Creating initial types for ${space}`,
        createdAtBlock
      )
    }
  }
}
