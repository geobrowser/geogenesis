import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '../../constants';
import { createGeoId } from '../id';
import { SYSTEM_IDS } from '../system-ids';

interface CreateCollectionItemArgs {
	fromId: string; // uuid
	toId: string; // uuid
	relationTypeId: string; // uuid
}

type CreateRelationTypeOp = {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.TYPES;
		entity: string;
		value: {
			type: 'ENTITY';
			value: typeof SYSTEM_IDS.RELATION_TYPE;
		};
	};
};

type CreateRelationTypeOfOp = {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE;
		entity: string;
		value: {
			type: 'ENTITY';
			value: string;
		};
	};
};

type CreateRelationFromOp = {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.RELATION_FROM_ATTRIBUTE;
		entity: string;
		value: {
			type: 'ENTITY';
			value: string;
		};
	};
};

type CreateRelationToOp = {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.RELATION_TO_ATTRIBUTE;
		entity: string;
		value: {
			type: 'ENTITY';
			value: string;
		};
	};
};

interface CreateRelationIndexOp {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.RELATION_INDEX;
		entity: string;
		value: {
			type: 'TEXT';
			value: string;
		};
	};
}

export function createRelationship(
	args: CreateCollectionItemArgs,
): readonly [
	CreateRelationTypeOp,
	CreateRelationFromOp,
	CreateRelationToOp,
	CreateRelationIndexOp,
	CreateRelationTypeOfOp,
] {
	const newEntityId = createGeoId();

	return [
		// Type of Collection Item
		{
			type: 'SET_TRIPLE',
			triple: {
				attribute: SYSTEM_IDS.TYPES,
				entity: newEntityId,
				value: {
					type: 'ENTITY',
					value: SYSTEM_IDS.RELATION_TYPE,
				},
			},
		},
		// Entity value for the collection itself
		{
			type: 'SET_TRIPLE',
			triple: {
				attribute: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
				entity: newEntityId,
				value: {
					type: 'ENTITY',
					value: args.fromId,
				},
			},
		},
		// Entity value for the entity referenced by this collection item
		{
			type: 'SET_TRIPLE',
			triple: {
				attribute: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
				entity: newEntityId,
				value: {
					type: 'ENTITY',
					value: args.toId,
				},
			},
		},
		{
			type: 'SET_TRIPLE',
			triple: {
				attribute: SYSTEM_IDS.RELATION_INDEX,
				entity: newEntityId,
				value: {
					type: 'TEXT',
					value: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
				},
			},
		},
		{
			type: 'SET_TRIPLE',
			triple: {
				attribute: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
				entity: newEntityId,
				value: {
					type: 'ENTITY',
					value: args.relationTypeId,
				},
			},
		},
	] as const;
}
