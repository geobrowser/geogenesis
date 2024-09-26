import type { SubspaceProposalMetadata } from '../../index.js';
import { createGeoId } from '../id.js';
import { ActionType, Subspace } from './index.js';

export function createSubspaceProposal({
	name,
	type,
	spaceAddress,
}: {
	name: string;
	type: SubspaceProposalMetadata['type'];
	spaceAddress: `0x${string}`;
}): Uint8Array {
	return new Subspace({
		type: type === 'ADD_SUBSPACE' ? ActionType.ADD_SUBSPACE : ActionType.REMOVE_SUBSPACE,
		version: '1.0.0',
		id: createGeoId(),
		subspace: spaceAddress,
		name,
	}).toBinary();
}
