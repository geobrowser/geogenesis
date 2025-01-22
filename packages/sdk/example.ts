import {
  type CreateRelationOp,
  type DeleteRelationOp,
  type DeleteTripleOp,
  type Op,
  Relation,
  type SetTripleOp,
  Triple,
  getCalldataForSpaceGovernanceType,
} from '@geogenesis/sdk';
import { EditProposal } from '@geogenesis/sdk/proto';

const setTripleOp: SetTripleOp = Triple.make({
  entityId: 'id of entity',
  attributeId: 'id of attribute',
  value: {
    type: 'TEXT', // TEXT | NUMBER | URL | TIME | POINT | CHECKBOX,
    value: 'hello world',
  },
});

const deleteTripleOp: DeleteTripleOp = Triple.remove({
  entityId: 'id of entity',
  attributeId: 'id of attribute',
});

const setRelationOp: CreateRelationOp = Relation.make({
  fromId: 'id of from entity',
  relationTypeId: 'id of relation type',
  toId: 'id of to entity',
});

const deleteRelationOp: DeleteRelationOp = Relation.remove('id of relation');

const ops: Op[] = [setTripleOp, deleteTripleOp, setRelationOp, deleteRelationOp];

const binaryEncodedEdit = EditProposal.make({
  name: 'Edit name',
  ops: ops,
  author: '0x0000000000000000000000000000000000000000',
});

const governanceType = space.governanceType;
const spacePluginAddress = space.spacePluginAddress;

const calldata = getCalldataForSpaceGovernanceType({
  cid: cid,
  spacePluginAddress: spacePluginAddress,
  governanceType: governanceType,
});

const txResult = await wallet.sendTransaction({
  to: space.type === 'PUBLIC' ? space.mainVotingPluginAddress : space.personalSpaceAdminPluginAddress,
  value: 0n,
  data: callData,
});
