import { SYSTEM_IDS, createGeoId } from '../../index.js';

interface CreateCollectionReturnType {
	type: 'SET_TRIPLE';
	triple: {
		attribute: typeof SYSTEM_IDS.TYPES;
		entity: string;
		value: {
			type: 'ENTITY';
			value: typeof SYSTEM_IDS.COLLECTION_TYPE;
		};
	};
}

export function createCollection(): CreateCollectionReturnType {
	return {
		type: 'SET_TRIPLE',
		triple: {
			attribute: SYSTEM_IDS.TYPES,
			entity: createGeoId(),
			value: {
				type: 'ENTITY',
				value: SYSTEM_IDS.COLLECTION_TYPE,
			},
		},
	};
}
