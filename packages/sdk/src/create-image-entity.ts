import { createGeoId } from './id.js';
import { SYSTEM_IDS } from './system-ids';

type CreateImageEntityOpsReturnType = [
	{
		type: 'SET_TRIPLE';
		triple: {
			entity: string;
			attribute: typeof SYSTEM_IDS.TYPES;
			value: {
				type: 'ENTITY';
				value: typeof SYSTEM_IDS.IMAGE;
			};
		};
	},
	{
		type: 'SET_TRIPLE';
		triple: {
			entity: string;
			attribute: typeof SYSTEM_IDS.IMAGE_URL_ATTRIBUTE;
			value: {
				type: 'URI';
				value: string;
			};
		};
	},
];

/**
 * Creates an entity representing an Image.
 *
 * @returns ops: The SET_TRIPLE ops for an Image entity
 */
export function createImageEntityOps(src: string): CreateImageEntityOpsReturnType {
	const entityId = createGeoId();

	return [
		{
			type: 'SET_TRIPLE',
			triple: {
				entity: entityId,
				attribute: SYSTEM_IDS.TYPES,
				value: {
					type: 'ENTITY',
					value: SYSTEM_IDS.IMAGE,
				},
			},
		},
		{
			type: 'SET_TRIPLE',
			triple: {
				entity: entityId,
				attribute: SYSTEM_IDS.IMAGE_URL_ATTRIBUTE,
				value: {
					type: 'URI',
					value: src,
				},
			},
		},
	];
}
