import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/claims/ontology';
import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '~/core/topics/ontology';

/** Several kinds have more than one Type entity of the same name (Person ×7), so a kind is a list of ids. */

export const BROADER_TOPICS_PROPERTY_ID = 'b35bd6d39fb64f3a8aeaf5a9b91b5ef6';
export const RELATED_PEOPLE_PROPERTY_ID = '5df8e4329cc54f038f854ac82e157ada';
export const RELATED_PROJECTS_PROPERTY_ID = '6e3503fab974460ea3dbab8af9a41427';
export const RELATED_ENTITIES_PROPERTY_ID = 'dfa6aebe1ca94bf29faccc4cc7afb24c';
export const ACTORS_PROPERTY_ID = 'e5bd8aace4c84dc982a2209428007b9b';
export const COUNTRY_PROPERTY_ID = '6d8cd471f7af415f941118b1ef106434';
export const HEADQUARTERS_PROPERTY_ID = '367464b3a47d497682f1cc1e14571f63';
export const LED_BY_PROPERTY_ID = '9752009e95894170bca19ac6173b69a8';
export const FOUNDERS_PROPERTY_ID = '29caab4009cf4e909f6fec4c2455d424';

export { SUBTOPIC_RELATION_TYPE_ID, UNNAMED_SUBTOPIC_PROPERTY_ID, TOPICS_PROPERTY_ID, CLAIM_TYPE_ID, TOPIC_TYPE_ID };

/**
 * How a relation reads from each end. `out` is the property's own sense (centre → neighbour); `in`
 * is the same relation seen from its target. Ids not listed fall back to the property's name.
 */
export const RELATION_LABELS: Record<string, { out: string; in: string }> = {
  [SUBTOPIC_RELATION_TYPE_ID]: { out: 'Subtopic', in: 'Broader topic' },
  [UNNAMED_SUBTOPIC_PROPERTY_ID]: { out: 'Subtopic', in: 'Broader topic' },
  [BROADER_TOPICS_PROPERTY_ID]: { out: 'Broader topic', in: 'Subtopic' },
  [RELATED_PEOPLE_PROPERTY_ID]: { out: 'Related person', in: 'Related to' },
  [RELATED_PROJECTS_PROPERTY_ID]: { out: 'Related project', in: 'Related to' },
  [RELATED_ENTITIES_PROPERTY_ID]: { out: 'Related entity', in: 'Related to' },
  [ACTORS_PROPERTY_ID]: { out: 'Actor', in: 'Actor in' },
  [COUNTRY_PROPERTY_ID]: { out: 'Country', in: 'Country of' },
  [HEADQUARTERS_PROPERTY_ID]: { out: 'Headquarters', in: 'Headquarters of' },
  [LED_BY_PROPERTY_ID]: { out: 'Led by', in: 'Leads' },
  [FOUNDERS_PROPERTY_ID]: { out: 'Founder', in: 'Founded' },
};

/** The two Subtopics properties carry the same relation (GEO-2722); spokes merge them. */
export const SUBTOPIC_PROPERTY_IDS = [SUBTOPIC_RELATION_TYPE_ID, UNNAMED_SUBTOPIC_PROPERTY_ID];

/** Entity-to-entity relations that become spokes. Everything else (Types, Tags, Sources, Stories…) is plumbing or coverage. */

/**
 * Claim → entity relations that make a claim "about" an entity. `Topics` covers topics; the rest
 * cover people, organisations and countries.
 */
export const CLAIM_ABOUT_PROPERTY_IDS = [
  TOPICS_PROPERTY_ID,
  RELATED_PEOPLE_PROPERTY_ID,
  RELATED_PROJECTS_PROPERTY_ID,
  RELATED_ENTITIES_PROPERTY_ID,
  ACTORS_PROPERTY_ID,
];

/** The prototype's Who's who kinds, mapped to every testnet Type entity of that name. */
export const NEIGHBOUR_KIND_TYPE_IDS = {
  topic: [TOPIC_TYPE_ID],
  person: [
    '7ed45f2bc48b419e8e4664d5ff680b0d',
    '56cec3d19f5a4cb0a36d4349b9a76945',
    '5b0c9d72f39e447abbddaefdbd55bc53',
    '68115e96eeed44eab5478dfdc702cfa8',
    '6acbc248a5c44c0691c5194dd28cea30',
    '6b4edbdbc42845a1acba133869ffa04d',
    '97f23f951bfc4dd3ac49162aecd917a4',
  ],
  // Organisations, UN bodies and agencies are typed Organization; parties and nonprofits have their own types.
  organisation: [
    '9547f4fb78744de0a9a9fdd7b4c01c0c',
    'b96f0d59e9d682cfe877c8948d6f1f50',
    '12dc50252c8e4fc7937dabd68cb754c9',
    '3bc3b3e44644488f81a6ce3afdbc0dfe',
    '3d77da68dd774204bdcfc4b6786a63b3',
    'd14286d9980d4762b19eef8e233c61b2',
    '0670e4b01202415bb2929502d22de8e4', // Political party
    'c7a192a339094572a848a56b64dc4636', // Nonprofit
    '528ed820edce46579f706ac5a4303364', // Armed group ×4
    'bde76d0002cb4a9494f7c003d3a9f905',
    'cb6ecab5c2e24336a423ebd91d4371ce',
    'f182e553211241b3b93e5ee4cd9fc9a7',
  ],
  court: ['340763c1a70fb27d8c085a7704628194'],
  government: [
    'c3b48b961db3b34ea416b6c0948bd302', // Federal agency
    'a22cc735ed70965ddd5297d87189d2c9', // Legislative chamber
    '021a3de50e53441fb5ec7242ae9339b4', // Conflict actor ×7 (states and parties in a conflict)
    '2a79ab5c25254b4b8e5649ce4bc7354c',
    '68734ec399da4f9abea3269e9b8d54f7',
    'bf677c6dd5444ab2905a24c98b9a2000',
    'c7da6724ad964fabaef99d6c9ef521fd',
    'd2f9b227884e4512b6402f5b58bfdd96',
    'e164d8bd8d2642a0956212bdbd643fea',
  ],
  place: [
    '26dfb7057a578db045291df18077347d', // Sovereign state
    '4e15b9ad68e245fc9b75263ba23247f0', // Country ×5
    '4ef6ee6b2f2444a7b5a9ae69d69a7239',
    '8ebf79d053214df7885835e819dcebf2',
    'd69ac5987a6b445ba14a92bed09e9ee7',
    '42a0a7618c82459fad0834bfeb437cde',
    'c188844a722442abb4762991c9c913f1', // Region
    '01b05333941a4b00bc78fac5a15b467d', // City
    '783bc688e65f4e54b67fa5643d78345e', // Place
  ],
  event: [
    '4d876b81787e41fcab5d075d4da66a3f',
    '2e83c5cef28ffca713cd29f4b628ccfa',
    '38e78f2f4d7845e3939eacdcbd59ef96',
    '800721f355d38f38d871f58dfb327179',
    '1eccdc8fc52b4cb38ed4f4186ebb588e', // Conflict ×3
    'cd4222c1a0264dcbbb8ca19fb4ee3408',
    'e640a82eb8fd40f2b1ba6201e602642f',
  ],
} as const;
